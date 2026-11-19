const { test } = require('bun:test');
const assert = require('node:assert');
const { createReporter } = require('./github');
const { parseGithubRepo, statusText, failureSummary } = require('./lib');

const SHA = 'a'.repeat(40);
const repo = { owner: 'owner', name: 'repo' };

// A fake GitHub API that records every request and answers like the real one.
function fakeGithub({ status = 201 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ method: init.method, path: url.replace('https://api.github.com/repos/owner/repo', ''), body: JSON.parse(init.body), auth: init.headers.Authorization });
    const body = url.endsWith('/deployments') ? { id: 77 } : {};
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

test('a successful deploy creates a deployment and ends with success statuses', async () => {
  const github = fakeGithub();
  const reporter = createReporter({ token: 't0ken', repo, publicUrl: 'https://f1.example/', fetchImpl: github.fetchImpl, log: () => {} });

  reporter.started(SHA, 46);
  reporter.step(SHA, 'Testing…');
  reporter.live(SHA, 46, 52);
  await reporter.idle();

  assert.deepStrictEqual(github.calls.map((call) => `${call.method} ${call.path}`), [
    'POST /deployments',
    'POST /deployments/77/statuses',
    `POST /statuses/${SHA}`,
    `POST /statuses/${SHA}`,
    'POST /deployments/77/statuses',
    `POST /statuses/${SHA}`
  ]);
  const [deployment, inProgress, building, testing, success, live] = github.calls.map((call) => call.body);
  assert.strictEqual(deployment.ref, SHA);
  assert.strictEqual(deployment.environment, 'production');
  assert.deepStrictEqual(deployment.required_contexts, []);
  assert.strictEqual(inProgress.state, 'in_progress');
  assert.strictEqual(building.description, 'Building #46…');
  assert.strictEqual(testing.description, 'Testing…');
  assert.strictEqual(success.state, 'success');
  assert.strictEqual(success.environment_url, 'https://f1.example');
  assert.strictEqual(success.auto_inactive, true);
  assert.deepStrictEqual([live.state, live.description, live.context, live.target_url], ['success', 'Live as #46 in 52s', 'F1 Calendar', 'https://f1.example']);
  assert.ok(github.calls.every((call) => call.auth === 'Bearer t0ken'));
});

test('a failed deploy points GitHub at the status page', async () => {
  const github = fakeGithub();
  const reporter = createReporter({ token: 't', repo, publicUrl: 'https://f1.example', fetchImpl: github.fetchImpl, log: () => {} });

  reporter.started(SHA, 47);
  reporter.failed(SHA, 'Tests failed');
  await reporter.idle();

  const deploymentFailure = github.calls.find((call) => call.path === '/deployments/77/statuses' && call.body.state === 'failure');
  const commitFailure = github.calls.at(-1).body;
  assert.ok(deploymentFailure);
  assert.strictEqual(deploymentFailure.body.log_url, 'https://f1.example/__deploy/status');
  assert.strictEqual(commitFailure.state, 'failure');
  assert.match(commitFailure.description, /^Tests failed/);
  assert.strictEqual(commitFailure.target_url, 'https://f1.example/__deploy/status');
});

test('queued and skipped commits get a commit status only', async () => {
  const github = fakeGithub();
  const reporter = createReporter({ token: 't', repo, publicUrl: 'https://f1.example', fetchImpl: github.fetchImpl, log: () => {} });

  reporter.queued(SHA);
  reporter.skipped(SHA);
  await reporter.idle();

  assert.deepStrictEqual(github.calls.map((call) => [call.path, call.body.state]), [[`/statuses/${SHA}`, 'pending'], [`/statuses/${SHA}`, 'error']]);
});

test('without a token nothing is sent', async () => {
  const github = fakeGithub();
  const reporter = createReporter({ token: '', repo, fetchImpl: github.fetchImpl });
  reporter.started(SHA, 1);
  reporter.live(SHA, 1, 1);
  await reporter.idle();
  assert.strictEqual(reporter.enabled, false);
  assert.strictEqual(github.calls.length, 0);
});

test('API errors and network failures are logged, never thrown', async () => {
  const logged = [];
  const failing = createReporter({ token: 'secret-token', repo, fetchImpl: fakeGithub({ status: 401 }).fetchImpl, log: (line) => logged.push(line) });
  failing.started(SHA, 1);
  failing.live(SHA, 1, 1);
  await failing.idle();

  const offline = createReporter({ token: 'secret-token', repo, fetchImpl: async () => { throw new Error('offline'); }, log: (line) => logged.push(line) });
  offline.failed(SHA, 'Build failed');
  await offline.idle();

  assert.ok(logged.some((line) => line.includes('401')));
  assert.ok(logged.some((line) => line.includes('offline')));
  assert.ok(logged.every((line) => !line.includes('secret-token')));
});

test('GitHub remotes are recognised in every form', () => {
  assert.deepStrictEqual(parseGithubRepo('https://github.com/MarkVebeer/F1-Calendar.git'), { owner: 'MarkVebeer', name: 'F1-Calendar' });
  assert.deepStrictEqual(parseGithubRepo('git@github.com:MarkVebeer/F1-Calendar.git\n'), { owner: 'MarkVebeer', name: 'F1-Calendar' });
  assert.deepStrictEqual(parseGithubRepo('https://github.com/MarkVebeer/F1-Calendar'), { owner: 'MarkVebeer', name: 'F1-Calendar' });
  assert.strictEqual(parseGithubRepo('file:///tmp/origin.git'), null);
});

test('status texts fit GitHub limits and failures get a short reason', () => {
  assert.strictEqual(statusText('x'.repeat(200)).length, 140);
  assert.strictEqual(failureSummary(new Error('test failed (exit 1)')), 'Tests failed');
  assert.strictEqual(failureSummary(new Error('build failed (exit 2)')), 'Build failed');
  assert.strictEqual(failureSummary(new Error('install failed (exit 1)')), 'Install failed');
  assert.strictEqual(failureSummary(new Error('health check failed: no answer')), 'Health check failed');
  assert.strictEqual(failureSummary(new Error('the checkout has local changes')), 'Deploy failed');
});
