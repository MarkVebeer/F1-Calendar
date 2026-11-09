const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-migrate-'));
process.env.DATA_DIR = dataDir;
process.env.TRACK_DATA_DIR = path.join(dataDir, 'tracks');

const { migrate } = require('./migrate');

const query = (db, sql) => new Promise((resolve, reject) => {
  db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const execute = (db, sql) => new Promise((resolve, reject) => {
  db.exec(sql, (err) => (err ? reject(err) : resolve()));
});
const close = (db) => new Promise((resolve) => db.close(resolve));
const columnNames = async (db, table) => (await query(db, `PRAGMA table_info(${table})`)).map((column) => column.name);
const backups = (prefix) => fs.readdirSync(path.join(dataDir, 'backups')).filter((file) => file.startsWith(prefix));

const memoryDb = () => new sqlite3.Database(':memory:');

test('a failed migration is rolled back and not recorded', async () => {
  const db = memoryDb();
  const migrations = [{
    id: 'test_001_broken',
    up: async (tx) => {
      await tx.exec('CREATE TABLE half_done (id INTEGER)');
      await tx.exec('THIS IS NOT SQL');
    }
  }];

  await assert.rejects(migrate(db, { name: 'test', migrations, backupDir: path.join(dataDir, 'unused') }), /test_001_broken/);
  assert.deepStrictEqual(await query(db, "SELECT name FROM sqlite_master WHERE name = 'half_done'"), []);
  assert.deepStrictEqual(await query(db, 'SELECT id FROM schema_migrations'), []);
});

test('an applied migration runs only once', async () => {
  const db = memoryDb();
  let runs = 0;
  const migrations = [{ id: 'test_001_once', up: async () => { runs += 1; } }];
  const options = { name: 'once', migrations, backupDir: path.join(dataDir, 'unused') };

  await migrate(db, options);
  await migrate(db, options);
  assert.strictEqual(runs, 1);
});

test('an old races database is upgraded, backed up and keeps its data', async () => {
  const oldDb = new sqlite3.Database(path.join(dataDir, 'f1calendar.db'));
  await execute(oldDb, `
    CREATE TABLE races (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT, date TEXT NOT NULL, type TEXT, ics_uid TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE custom_events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT, date TEXT NOT NULL, type TEXT DEFAULT 'custom', description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO custom_events (name, date) VALUES ('Watch party', '2026-11-22');
  `);
  await close(oldDb);

  const db = require('./db');
  await db.initDatabase();
  assert.strictEqual(backups('races-').length, 1);

  await db.initDatabase();
  assert.strictEqual(backups('races-').length, 1);

  const events = await db.getAllEvents();
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].name, 'Watch party');
  assert.strictEqual(events[0].circuit_id, null);

  const check = new sqlite3.Database(path.join(dataDir, 'f1calendar.db'));
  const columns = await columnNames(check, 'races');
  ['raw_summary', 'city', 'circuit_name', 'circuit_id', 'lat', 'lon', 'timezone', 'end_date'].forEach((column) => assert.ok(columns.includes(column), column));
  assert.ok((await columnNames(check, 'custom_events')).includes('end_date'));
  await close(check);
});

test('replaceRaces keeps ids, updates changed rows and removes dropped ones', async () => {
  const db = require('./db');
  await db.initDatabase();
  const race = (uid, name) => ({ name, location: 'Hungary', date: '2027-07-30T12:00:00.000Z', type: 'race', ics_uid: uid, circuit_id: 'hungaroring' });

  await db.replaceRaces([race('a', 'First'), race('b', 'Second')]);
  const before = await db.getAllRaces();
  const idOf = (rows, name) => rows.find((row) => row.name === name)?.id;

  await db.replaceRaces([race('a', 'Renamed')]);
  const after = await db.getAllRaces();

  assert.strictEqual(after.length, 1);
  assert.strictEqual(idOf(after, 'Renamed'), idOf(before, 'First'));
});

test('a fresh discord database gets every column', async () => {
  const discordDb = require('./discordDb');
  await discordDb.initDiscordDatabase();

  const check = new sqlite3.Database(path.join(dataDir, 'f1calendar-discord.db'));
  assert.ok((await columnNames(check, 'discord_notifications')).includes('event_types'));
  assert.ok((await columnNames(check, 'discord_weather_settings')).includes('channel_id'));
  await close(check);
  assert.strictEqual(fs.readdirSync(path.join(dataDir, 'backups')).filter((file) => file.startsWith('discord-')).length, 0);
});
