const { test, beforeAll, afterAll } = require('bun:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-sessions-'));
const password = crypto.randomBytes(12).toString('hex');
Object.assign(process.env, {
  DATA_DIR: dataDir,
  TRACK_DATA_DIR: path.join(dataDir, 'tracks'),
  ADMIN_USERNAME: 'session-tester',
  ADMIN_PASSWORD: password
});

const { app } = require('./index');
const adminDb = require('./adminDb');
const { openDatabase } = require('./sqlite');

let server;
let baseUrl;
const children = [];

beforeAll(async () => {
  await adminDb.initAdminDatabase();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
  children.forEach((child) => child.kill());
});

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'session-tester', password })
  });
  assert.strictEqual(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

const me = (url, cookie) => fetch(`${url}/api/admin/me`, { headers: { Cookie: cookie } }).then((response) => response.status);

// Starts the app in a new process on the same data folder, like a restart or a deploy does.
async function startAnotherProcess(env = {}) {
  const script = `
    const adminDb = require('./adminDb');
    const { app } = require('./index');
    await adminDb.initAdminDatabase();
    const server = app.listen(0, () => console.log('PORT=' + server.address().port));
  `;
  const child = Bun.spawn([process.execPath, '-e', script], {
    cwd: __dirname,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'inherit'
  });
  children.push(child);
  const reader = child.stdout.getReader();
  let output = '';
  while (!/PORT=\d+/.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`process exited before listening: ${output}`);
    output += new TextDecoder().decode(value);
  }
  return { child, url: `http://127.0.0.1:${output.match(/PORT=(\d+)/)[1]}` };
}

test('a login is stored as a hash, not as the cookie value', async () => {
  const cookie = await login();
  const token = cookie.split('=')[1];
  const db = openDatabase(path.join(dataDir, 'f1calendar-admin.db'));
  const rows = await db.all("SELECT token_hash FROM sessions WHERE kind = 'admin'");
  db.close();
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => row.token_hash !== token));
});

test('a login keeps working in a new process on the same data', async () => {
  const cookie = await login();
  const { child, url } = await startAnotherProcess();
  assert.strictEqual(await me(url, cookie), 200);
  assert.strictEqual(await me(url, 'admin_session=not-a-real-token'), 401);
  child.kill();
});

test('logging out ends the session in every process', async () => {
  const cookie = await login();
  const { child, url } = await startAnotherProcess();
  assert.strictEqual((await fetch(`${baseUrl}/api/admin/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 200);
  assert.strictEqual(await me(url, cookie), 401);
  child.kill();
});

test('a new admin password from the panel logs old sessions out on start', async () => {
  const cookie = await login();
  const { child, url } = await startAnotherProcess({ ADMIN_PASSWORD: `${password}-changed` });
  assert.strictEqual(await me(url, cookie), 401);
  child.kill();
});
