const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-settings-'));
const password = crypto.randomBytes(12).toString('hex');
Object.assign(process.env, {
  DATA_DIR: dataDir,
  TRACK_DATA_DIR: path.join(dataDir, 'tracks'),
  ADMIN_USERNAME: 'settings-tester',
  ADMIN_PASSWORD: password
});

const { app } = require('./index');
const adminDb = require('./adminDb');
const { groupRacesByName, pickNextWeekend } = require('./weatherWorker');

let server;
let baseUrl;

test.before(async () => {
  await adminDb.initAdminDatabase();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const putSetting = (value, cookie) => fetch(`${baseUrl}/api/admin/site-settings`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify({ pastWeekendsVisible: value })
});

const readSetting = async () => (await (await fetch(`${baseUrl}/api/site-settings`)).json()).pastWeekendsVisible;

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'settings-tester', password })
  });
  assert.strictEqual(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('changing races or forcing a sync needs an admin session', async () => {
  const db = require('./db');
  await db.initDatabase();
  const race = JSON.stringify({ name: 'Manual race', location: 'Hungary', date: '2099-07-19T13:00:00.000Z', type: 'race' });
  const headers = { 'Content-Type': 'application/json' };

  assert.strictEqual((await fetch(`${baseUrl}/api/races`, { method: 'POST', headers, body: race })).status, 401);
  assert.strictEqual((await fetch(`${baseUrl}/api/races/1`, { method: 'DELETE' })).status, 401);
  assert.strictEqual((await fetch(`${baseUrl}/api/sync`, { method: 'POST' })).status, 401);
  assert.strictEqual((await db.getAllRaces()).length, 0);

  const Cookie = await login();
  const created = await fetch(`${baseUrl}/api/races`, { method: 'POST', headers: { ...headers, Cookie }, body: race });
  assert.strictEqual(created.status, 201);
  const { id } = await created.json();
  assert.strictEqual((await fetch(`${baseUrl}/api/races/${id}`, { method: 'DELETE', headers: { Cookie } })).status, 204);
  assert.strictEqual((await db.getAllRaces()).length, 0);
});

test('the default is one finished weekend', async () => {
  assert.strictEqual(await readSetting(), 1);
});

test('only an admin can change the setting', async () => {
  assert.strictEqual((await putSetting(3)).status, 401);
  assert.strictEqual(await readSetting(), 1);
});

test('invalid values are rejected', async () => {
  const cookie = await login();
  for (const value of [-1, 25, 1.5, '2', null]) {
    assert.strictEqual((await putSetting(value, cookie)).status, 400, String(value));
  }
  assert.strictEqual(await readSetting(), 1);
});

test('a valid value is stored', async () => {
  const cookie = await login();
  assert.strictEqual((await putSetting(0, cookie)).status, 200);
  assert.strictEqual(await readSetting(), 0);
  assert.strictEqual((await putSetting(24, cookie)).status, 200);
  assert.strictEqual(await readSetting(), 24);
});

test('weather grouping keeps the same Grand Prix apart by season', () => {
  const races = [
    { name: 'QATAR GP', date: '2026-11-29T16:00:00.000Z' },
    { name: 'QATAR GP', date: '2027-12-05T16:00:00.000Z' },
    { name: 'QATAR GP', date: '2026-11-27T12:00:00.000Z' }
  ];
  const grouped = groupRacesByName(races);
  assert.strictEqual(grouped.size, 2);

  const next = pickNextWeekend(grouped, new Date('2026-11-09T12:00:00.000Z'));
  assert.strictEqual(next.name, 'QATAR GP');
  assert.strictEqual(next.events.length, 2);
  assert.strictEqual(next.startEvent.date, '2026-11-27T12:00:00.000Z');
});
