const path = require('path');
const { openDatabase } = require('./sqlite');
const { dataDir } = require('./env');
const { migrate } = require('./migrate');

const dbPath = path.join(dataDir, 'f1calendar.db');
const db = openDatabase(dbPath);

const migrations = [
  {
    // Written to bring a database from any earlier release up to date.
    id: 'races_001_baseline',
    up: async (tx) => {
      await tx.exec(`
        CREATE TABLE IF NOT EXISTS races (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          location TEXT,
          city TEXT,
          circuit_name TEXT,
          circuit_id TEXT,
          lat REAL,
          lon REAL,
          timezone TEXT,
          date TEXT NOT NULL,
          end_date TEXT,
          type TEXT,
          ics_uid TEXT UNIQUE,
          raw_summary TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS custom_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          location TEXT,
          date TEXT NOT NULL,
          end_date TEXT,
          type TEXT DEFAULT 'custom',
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const raceColumns = [
        ['raw_summary', 'TEXT'],
        ['city', 'TEXT'],
        ['circuit_name', 'TEXT'],
        ['circuit_id', 'TEXT'],
        ['lat', 'REAL'],
        ['lon', 'REAL'],
        ['timezone', 'TEXT'],
        ['end_date', 'TEXT']
      ];
      for (const [column, definition] of raceColumns) {
        await tx.addColumnIfMissing('races', column, definition);
      }
      await tx.addColumnIfMissing('custom_events', 'end_date', 'TEXT');
    }
  },
  {
    // Daily forecasts per race weekend, refreshed by a background job and served from here.
    id: 'races_002_weather_forecasts',
    up: (tx) => tx.exec(`
      CREATE TABLE IF NOT EXISTS weather_forecasts (
        weekend_key TEXT PRIMARY KEY,
        fetched_at TEXT NOT NULL,
        days TEXT NOT NULL
      );
    `)
  }
];

function initDatabase() {
  return migrate(db, { name: 'races', migrations, backupDir: path.join(dataDir, 'backups') });
}

const EVENT_COLUMNS = `
  SELECT id, name, location, city, circuit_name, circuit_id, lat, lon, timezone, date, end_date, type, raw_summary, created_at, 'race' as source
  FROM races
  {where}
  UNION ALL
  SELECT id, name, location, NULL as city, NULL as circuit_name, NULL as circuit_id, NULL as lat, NULL as lon, NULL as timezone, date, end_date, type, NULL as raw_summary, created_at, 'custom' as source
  FROM custom_events
  {where}
  ORDER BY date ASC
`;

function getAllRaces() {
  return db.all('SELECT * FROM races ORDER BY date ASC');
}

// Races and custom events together
function getAllEvents() {
  return db.all(EVENT_COLUMNS.replaceAll('{where}', ''));
}

async function addRace({ name, location, date, end_date, type, ics_uid, raw_summary, city, circuit_name, circuit_id, lat, lon, timezone }) {
  const { lastID } = await db.run(
    `
      INSERT OR REPLACE INTO races (name, location, date, end_date, type, ics_uid, raw_summary, city, circuit_name, circuit_id, lat, lon, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [name, location, date, end_date || null, type, ics_uid, raw_summary || null, city || null, circuit_name || null, circuit_id || null, lat ?? null, lon ?? null, timezone || null]
  );
  return lastID;
}

async function addCustomEvent({ name, location, date, end_date, type, description }) {
  const { lastID } = await db.run(
    `
      INSERT INTO custom_events (name, location, date, end_date, type, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [name, location, date, end_date || null, type || 'custom', description || null]
  );
  return lastID;
}

function getUpcomingRaces(windowHours = 72) {
  const now = new Date();
  const until = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  return db.all(
    'SELECT * FROM races WHERE type = ? AND date BETWEEN ? AND ? ORDER BY date ASC',
    ['race', now.toISOString(), until.toISOString()]
  );
}

function getUpcomingEvents(windowHours = 72) {
  // Look back 5 minutes to catch events that are about to happen or just starting
  const now = new Date();
  const from = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const until = new Date(now.getTime() + windowHours * 60 * 60 * 1000).toISOString();
  return db.all(EVENT_COLUMNS.replaceAll('{where}', 'WHERE date BETWEEN ? AND ?'), [from, until, from, until]);
}

async function deleteCustomEvent(id) {
  await db.run('DELETE FROM custom_events WHERE id = ?', [id]);
}

async function deleteRace(id) {
  await db.run('DELETE FROM races WHERE id = ?', [id]);
}

const UPSERT_RACE = `
  INSERT INTO races (name, location, date, end_date, type, ics_uid, raw_summary, city, circuit_name, circuit_id, lat, lon, timezone)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(ics_uid) DO UPDATE SET
    name = excluded.name,
    location = excluded.location,
    date = excluded.date,
    end_date = excluded.end_date,
    type = excluded.type,
    raw_summary = excluded.raw_summary,
    city = excluded.city,
    circuit_name = excluded.circuit_name,
    circuit_id = excluded.circuit_id,
    lat = excluded.lat,
    lon = excluded.lon,
    timezone = excluded.timezone
`;

// Keeps row ids stable across syncs, because Discord notification de-duplication relies on them.
const replaceRacesTx = db.raw.transaction((races) => {
  const upsertRace = db.raw.query(UPSERT_RACE);
  for (const race of races) {
    upsertRace.run(
      race.name,
      race.location,
      race.date,
      race.end_date || null,
      race.type,
      race.ics_uid,
      race.raw_summary || null,
      race.city || null,
      race.circuit_name || null,
      race.circuit_id || null,
      race.lat ?? null,
      race.lon ?? null,
      race.timezone || null
    );
  }

  const placeholders = races.map(() => '?').join(', ');
  // The calendar feed drops old events after a few weeks, but finished weekends stay listable.
  db.raw
    .prepare(`DELETE FROM races WHERE ics_uid IS NULL OR (ics_uid NOT IN (${placeholders}) AND date >= ?)`)
    .run(...races.map((race) => race.ics_uid), new Date().toISOString());
});

async function replaceRaces(races) {
  replaceRacesTx.immediate(races);
}

async function saveWeatherForecast(weekendKey, days) {
  await db.run(
    `INSERT INTO weather_forecasts (weekend_key, fetched_at, days) VALUES (?, ?, ?)
     ON CONFLICT(weekend_key) DO UPDATE SET fetched_at = excluded.fetched_at, days = excluded.days`,
    [weekendKey, new Date().toISOString(), JSON.stringify(days)]
  );
}

// { "2026/losail": { fetchedAt, days: [...] } }
async function getWeatherForecasts() {
  const rows = await db.all('SELECT weekend_key, fetched_at, days FROM weather_forecasts');
  const forecasts = {};
  for (const row of rows) {
    try {
      forecasts[row.weekend_key] = { fetchedAt: row.fetched_at, days: JSON.parse(row.days) };
    } catch {
      // a damaged row is skipped; the next refresh rewrites it
    }
  }
  return forecasts;
}

// Forecasts for weekends that ended more than a week ago are of no use to anyone.
async function pruneWeatherForecasts(keepKeys) {
  const keys = [...keepKeys];
  const placeholders = keys.map(() => '?').join(', ');
  await db.run(`DELETE FROM weather_forecasts WHERE weekend_key NOT IN (${placeholders})`, keys);
}

module.exports = {
  saveWeatherForecast,
  getWeatherForecasts,
  pruneWeatherForecasts,
  initDatabase,
  getAllRaces,
  getAllEvents,
  addRace,
  addCustomEvent,
  deleteRace,
  deleteCustomEvent,
  replaceRaces,
  getUpcomingRaces,
  getUpcomingEvents
};
