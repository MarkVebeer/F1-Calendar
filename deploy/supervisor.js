// Zero-downtime deploys for a single Pelican allocation.
//
// This process owns the public port and proxies every request to the live release on a private
// loopback port. On a push to GIT_BRANCH (GitHub webhook, or polling as a fallback) it builds and
// tests the new commit in releases/<sha>, starts it next to the live one, and switches traffic only
// once it answers. The old release is then shut down and the new one takes over the background jobs.

const fs = require('fs');
const net = require('net');
const path = require('path');
const { verifySignature, pushedCommit, releasesToPrune, upstreamHeaders, SHA_PATTERN } = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const RELEASES_DIR = path.join(ROOT, 'releases');
const CURRENT_FILE = path.join(RELEASES_DIR, 'current');
const READY_MARKER = '.release-ready';
// The installer runs as root, so the checkout may belong to another user than this process.
const GIT = ['git', '-c', 'safe.directory=*'];

const { env } = process;
const PORT = Number(env.SERVER_PORT || env.PORT || 3001);
const BRANCH = env.GIT_BRANCH || 'main';
const SECRET = (env.DEPLOY_WEBHOOK_SECRET || '').trim();
const POLL_SECONDS = env.DEPLOY_POLL_SECONDS === undefined || env.DEPLOY_POLL_SECONDS === '' ? 120 : Number(env.DEPLOY_POLL_SECONDS);
const AUTO_DEPLOY = env.AUTO_DEPLOY !== 'false';
const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || './data');
const KEEP_RELEASES = 3;
const HEALTH_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 15_000;

const log = (...parts) => console.log('[deploy]', ...parts);
const logError = (...parts) => console.error('[deploy]', ...parts);
const short = (sha) => (sha ? sha.slice(0, 7) : 'none');
const releaseDir = (sha) => path.join(RELEASES_DIR, sha);

let active = null; // { sha, port, proc, healthy, exited, stopping }
let shuttingDown = false;

// ---------- child processes ----------

async function pipeLines(stream, prefix, target) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      target.write(`${prefix} ${buffer.slice(0, index).replace(/\r$/, '')}\n`);
      buffer = buffer.slice(index + 1);
    }
  }
  if (buffer) target.write(`${prefix} ${buffer}\n`);
}

// Runs a command to completion, streaming its output. Throws with `step` in the message on failure.
async function run(step, cmd, { cwd = ROOT, quiet = false, extraEnv = {} } = {}) {
  const proc = Bun.spawn(cmd, { cwd, env: { ...env, FORCE_COLOR: '0', ...extraEnv }, stdout: 'pipe', stderr: 'pipe' });
  const chunks = [];
  const collect = async (stream, target) => {
    if (!quiet) return pipeLines(stream, `[${step}]`, target);
    chunks.push(await new Response(stream).text());
  };
  await Promise.all([collect(proc.stdout, process.stdout), collect(proc.stderr, process.stderr), proc.exited]);
  if (proc.exitCode !== 0) {
    throw new Error(`${step} failed (exit ${proc.exitCode})${quiet ? `: ${chunks.join('').trim().slice(-500)}` : ''}`);
  }
}

async function output(cmd, cwd = ROOT) {
  const proc = Bun.spawn(cmd, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(' ')} failed: ${stderr.trim() || stdout.trim()}`);
  }
  return stdout.trim();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startApp(sha) {
  const port = await freePort();
  const app = { sha, port, proc: null, healthy: false, exited: false, stopping: false };
  app.proc = Bun.spawn([process.execPath, 'startprod.js'], {
    cwd: releaseDir(sha),
    // env.js copies SERVER_PORT over PORT, so both point at the private port.
    env: { ...env, PORT: String(port), SERVER_PORT: String(port), DATA_DIR, F1_JOBS: 'wait' },
    stdout: 'pipe',
    stderr: 'pipe',
    ipc() {},
    onExit(_proc, exitCode) {
      app.exited = true;
      onAppExit(app, exitCode);
    }
  });
  pipeLines(app.proc.stdout, `[app ${short(sha)}]`, process.stdout);
  pipeLines(app.proc.stderr, `[app ${short(sha)}]`, process.stderr);
  log(`started ${short(sha)} on 127.0.0.1:${port}`);
  return app;
}

async function waitHealthy(app) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const base = `http://127.0.0.1:${app.port}`;
  while (Date.now() < deadline && !app.exited) {
    try {
      const [api, page] = await Promise.all([
        fetch(`${base}/api/site-settings`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${base}/`, { signal: AbortSignal.timeout(3000) })
      ]);
      if (api.ok && page.ok) {
        app.healthy = true;
        return true;
      }
    } catch {
      // not listening yet
    }
    await Bun.sleep(500);
  }
  return false;
}

async function stopApp(app) {
  if (!app || app.exited) return;
  app.stopping = true;
  try {
    app.proc.send({ type: 'shutdown' });
  } catch {
    app.proc.kill();
  }
  const exitedInTime = await Promise.race([app.proc.exited.then(() => true), Bun.sleep(STOP_TIMEOUT_MS).then(() => false)]);
  if (!exitedInTime) {
    logError(`${short(app.sha)} did not stop in time, killing it`);
    app.proc.kill(9);
    await app.proc.exited;
  }
}

// Traffic moves first; the jobs move only after the old release has exited.
async function promote(candidate) {
  const previous = active;
  active = candidate;
  if (previous) {
    await stopApp(previous);
  }
  candidate.proc.send({ type: 'start-jobs' });
  fs.writeFileSync(CURRENT_FILE, `${candidate.sha}\n`);
}

// ---------- crash recovery ----------

let restartDelay = 1000;
let restartTimer = null;

function onAppExit(app, exitCode) {
  if (app !== active || app.stopping || shuttingDown) return;
  logError(`${short(app.sha)} exited unexpectedly (code ${exitCode}), restarting in ${restartDelay / 1000}s`);
  scheduleRestart(app.sha);
}

function scheduleRestart(sha) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    if (shuttingDown || (active && !active.exited)) return;
    const app = await startApp(sha);
    if (await waitHealthy(app)) {
      restartDelay = 1000;
      await promote(app);
      log(`${short(sha)} is back up`);
    } else {
      await stopApp(app);
      restartDelay = Math.min(restartDelay * 2, 30_000);
      scheduleRestart(sha);
    }
  }, restartDelay);
}

// ---------- building releases ----------

const isReady = (sha) => SHA_PATTERN.test(sha || '') && fs.existsSync(path.join(releaseDir(sha), READY_MARKER));

// The build number is the commit count, which a shallow clone (older installers) cannot give.
async function ensureFullHistory() {
  if ((await output([...GIT, 'rev-parse', '--is-shallow-repository'])) === 'true') {
    log('fetching the full git history for build numbers');
    await run('fetch', [...GIT, 'fetch', '--quiet', '--unshallow', 'origin'], { quiet: true });
  }
}

// What the site footer shows: build number, commit and a link to it.
async function buildInfoEnv(sha) {
  await ensureFullHistory();
  const remote = await output([...GIT, 'remote', 'get-url', 'origin']).catch(() => '');
  return {
    F1_BUILD_SHA: sha,
    F1_BUILD_NUMBER: await output([...GIT, 'rev-list', '--count', sha]),
    F1_BUILD_REPO: remote
  };
}

async function buildRelease(sha) {
  if (isReady(sha)) {
    log(`${short(sha)} is already built`);
    return;
  }
  const buildEnv = await buildInfoEnv(sha);
  log(`building #${buildEnv.F1_BUILD_NUMBER} (${short(sha)})`);
  const dir = releaseDir(sha);
  const archive = path.join(RELEASES_DIR, `${sha}.tar`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  try {
    await run('archive', [...GIT, 'archive', '--format=tar', '-o', archive, sha], { quiet: true });
    // A relative archive path keeps GNU tar from reading "C:" in Windows paths as a remote host.
    await run('extract', ['tar', '-xf', path.relative(dir, archive)], { cwd: dir, quiet: true });
    await run('install', [process.execPath, 'install', '--production', '--frozen-lockfile'], { cwd: dir });
    await run('build', [process.execPath, 'run', 'build'], { cwd: dir, extraEnv: buildEnv });
    await run('test', [process.execPath, 'run', 'test'], { cwd: dir });
    fs.rmSync(path.join(dir, 'client', 'node_modules'), { recursive: true, force: true });
    fs.writeFileSync(path.join(dir, READY_MARKER), new Date().toISOString());
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

function pruneReleases(keepShas) {
  const releases = fs.readdirSync(RELEASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, mtimeMs: fs.statSync(path.join(RELEASES_DIR, entry.name)).mtimeMs }));
  for (const sha of releasesToPrune(releases, keepShas, KEEP_RELEASES)) {
    fs.rmSync(releaseDir(sha), { recursive: true, force: true });
    log(`removed old release ${short(sha)}`);
  }
}

// ---------- deploying ----------

let deploying = false;
let deployAgain = false;
let lastFailedSha = null;

function requestDeploy(reason, { retryFailed = false } = {}) {
  if (deploying) {
    deployAgain = true;
    return;
  }
  deploying = true;
  (async () => {
    try {
      do {
        deployAgain = false;
        await deployLatest(reason, retryFailed);
        reason = 'queued push';
      } while (deployAgain && !shuttingDown);
    } finally {
      deploying = false;
    }
  })();
}

async function deployLatest(reason, retryFailed) {
  const started = Date.now();
  let sha;
  try {
    await run('fetch', [...GIT, 'fetch', '--quiet', 'origin', BRANCH], { quiet: true });
    sha = await output([...GIT, 'rev-parse', 'FETCH_HEAD']);
    if (active && !active.exited && sha === active.sha) {
      return;
    }
    if (sha === lastFailedSha && !retryFailed) {
      return;
    }
    log(`deploying ${short(sha)} (${reason}), live is ${short(active?.sha)}`);

    // Never throw away work: the checkout is only moved when it has no local edits.
    if (await output([...GIT, 'status', '--porcelain', '--untracked-files=no'])) {
      throw new Error('the checkout has local changes; commit or discard them first');
    }
    const previousHead = await output([...GIT, 'rev-parse', 'HEAD']);
    const supervisorChanged = await output([...GIT, 'diff', '--name-only', previousHead, sha, '--', 'deploy']);
    await run('checkout', [...GIT, 'reset', '--quiet', '--hard', sha], { quiet: true });

    await buildRelease(sha);
    const candidate = await startApp(sha);
    if (!(await waitHealthy(candidate))) {
      await stopApp(candidate);
      throw new Error('health check failed: the new release did not answer on / and /api/site-settings');
    }
    await promote(candidate);
    lastFailedSha = null;
    pruneReleases([sha]);
    log(`${short(sha)} is live (${Math.round((Date.now() - started) / 1000)}s)`);
    if (supervisorChanged) {
      log('this commit changed deploy/; restart the server in Pelican to run the new supervisor');
    }
  } catch (error) {
    lastFailedSha = sha || lastFailedSha;
    logError(`deploy of ${short(sha)} failed: ${error.message}. ${short(active?.sha)} stays live.`);
  }
}

async function pollRemote() {
  if (deploying || shuttingDown) return;
  try {
    const line = await output([...GIT, 'ls-remote', 'origin', `refs/heads/${BRANCH}`]);
    const sha = line.split(/\s+/)[0];
    if (SHA_PATTERN.test(sha) && sha !== active?.sha && sha !== lastFailedSha) {
      requestDeploy('poll');
    }
  } catch (error) {
    logError(`poll failed: ${error.message}`);
  }
}

// ---------- HTTP ----------

const text = (body, status, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });

async function handleWebhook(req) {
  if (!SECRET) return text('Not found', 404);
  if (req.method !== 'POST') return text('Method not allowed', 405);

  const rawBody = await req.text();
  if (!verifySignature(SECRET, rawBody, req.headers.get('x-hub-signature-256'))) {
    logError('rejected a webhook with a bad signature');
    return text('Bad signature', 401);
  }

  const event = req.headers.get('x-github-event');
  if (event === 'ping') return text('pong', 200);

  let payload;
  try {
    // GitHub sends either application/json or a form field named payload.
    const json = rawBody.startsWith('payload=') ? new URLSearchParams(rawBody).get('payload') : rawBody;
    payload = JSON.parse(json);
  } catch {
    return text('Invalid payload', 400);
  }

  const sha = pushedCommit(event, payload, BRANCH);
  if (!sha) return text('Ignored', 202);
  if (!AUTO_DEPLOY) return text('Automatic deploys are off', 202);

  log(`webhook: push of ${short(sha)} to ${BRANCH}`);
  requestDeploy('webhook', { retryFailed: true });
  return text('Deploy queued', 202);
}

async function proxy(req, server) {
  const url = new URL(req.url);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const headers = upstreamHeaders(req.headers, server.requestIP(req)?.address);
  // A GET that lands on a release in the middle of shutting down is retried once on its successor.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const target = active;
    if (!target || !target.healthy) {
      return text('The site is updating, try again in a moment.', 503, { 'retry-after': '5' });
    }
    try {
      const upstream = await fetch(`http://127.0.0.1:${target.port}${url.pathname}${url.search}`, {
        method: req.method,
        headers,
        body: hasBody ? req.body : undefined,
        duplex: 'half',
        redirect: 'manual',
        decompress: false
      });
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
    } catch (error) {
      if (hasBody || active === target) {
        logError(`proxy error: ${error.message}`);
        return text('Bad gateway', 502);
      }
    }
  }
  return text('Bad gateway', 502);
}

// ---------- startup and shutdown ----------

async function startInitialRelease() {
  const recorded = fs.existsSync(CURRENT_FILE) ? fs.readFileSync(CURRENT_FILE, 'utf8').trim() : null;
  const candidates = [...new Set([recorded, await output([...GIT, 'rev-parse', 'HEAD'])])].filter(Boolean);

  for (const sha of candidates) {
    try {
      await buildRelease(sha);
      const app = await startApp(sha);
      if (await waitHealthy(app)) {
        await promote(app);
        return;
      }
      await stopApp(app);
      logError(`${short(sha)} did not become healthy`);
    } catch (error) {
      logError(`could not start ${short(sha)}: ${error.message}`);
    }
  }
  throw new Error('no release could be started');
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received, stopping`);
  clearTimeout(restartTimer);
  await stopApp(active);
  process.exit(0);
}

async function main() {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  Bun.serve({
    port: PORT,
    // Some admin actions (a forced sync, the weather debug) take longer than Bun's 10 second default.
    idleTimeout: 120,
    fetch(req, server) {
      if (new URL(req.url).pathname === '/__deploy/github') return handleWebhook(req);
      return proxy(req, server);
    }
  });
  log(`proxy listening on port ${PORT}, branch ${BRANCH}, auto deploy ${AUTO_DEPLOY ? 'on' : 'off'}, webhook ${SECRET ? 'on' : 'off'}, poll ${AUTO_DEPLOY && POLL_SECONDS > 0 ? `${POLL_SECONDS}s` : 'off'}`);

  await startInitialRelease();
  console.log(`Server running on port ${PORT}`);
  pruneReleases([active.sha]);

  if (AUTO_DEPLOY) {
    requestDeploy('startup check');
    if (POLL_SECONDS > 0) {
      setInterval(pollRemote, POLL_SECONDS * 1000);
    }
  }
}

main().catch((error) => {
  logError(`fatal: ${error.message}`);
  process.exit(1);
});
