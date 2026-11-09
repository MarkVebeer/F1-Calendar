const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { dataDir } = require('./env');
const { migrate } = require('./migrate');

const dbPath = path.join(dataDir, 'f1calendar.db');
const db = new sqlite3.Database(dbPath);

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
  }
];

function initDatabase() {
  return migrate(db, { name: 'races', migrations, backupDir: path.join(dataDir, 'backups') });
}

// Get all races
function getAllRaces() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM races ORDER BY date ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Get all events (races + custom events)
function getAllEvents() {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT id, name, location, city, circuit_name, circuit_id, lat, lon, timezone, date, end_date, type, created_at, 'race' as source
        FROM races
        UNION ALL
        SELECT id, name, location, NULL as city, NULL as circuit_name, NULL as circuit_id, NULL as lat, NULL as lon, NULL as timezone, date, end_date, type, created_at, 'custom' as source
        FROM custom_events
        ORDER BY date ASC
      `,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Add a race
function addRace({ name, location, date, end_date, type, ics_uid, raw_summary, city, circuit_name, circuit_id, lat, lon, timezone }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO races (name, location, date, end_date, type, ics_uid, raw_summary, city, circuit_name, circuit_id, lat, lon, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(name, location, date, end_date || null, type, ics_uid, raw_summary || null, city || null, circuit_name || null, circuit_id || null, lat ?? null, lon ?? null, timezone || null, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
    
    stmt.finalize();
  });
}

// Add a custom event
function addCustomEvent({ name, location, date, end_date, type, description }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO custom_events (name, location, date, end_date, type, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(name, location, date, end_date || null, type || 'custom', description || null, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });

    stmt.finalize();
  });
}

function getUpcomingRaces(windowHours = 72) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const until = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    db.all(
      'SELECT * FROM races WHERE type = ? AND date BETWEEN ? AND ? ORDER BY date ASC',
      ['race', now.toISOString(), until.toISOString()],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function getUpcomingEvents(windowHours = 72) {
  return new Promise((resolve, reject) => {
    // Look back 5 minutes to catch events that are about to happen or just starting
    const now = new Date();
    const lookbackMs = 5 * 60 * 1000; // 5 minutes back
    const from = new Date(now.getTime() - lookbackMs);
    const until = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    db.all(
      `
        SELECT id, name, location, city, circuit_name, circuit_id, lat, lon, timezone, date, end_date, type, created_at, 'race' as source
        FROM races
        WHERE date BETWEEN ? AND ?
        UNION ALL
        SELECT id, name, location, NULL as city, NULL as circuit_name, NULL as circuit_id, NULL as lat, NULL as lon, NULL as timezone, date, end_date, type, created_at, 'custom' as source
        FROM custom_events
        WHERE date BETWEEN ? AND ?
        ORDER BY date ASC
      `,
      [from.toISOString(), until.toISOString(), from.toISOString(), until.toISOString()],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Delete a custom event
function deleteCustomEvent(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM custom_events WHERE id = ?', id, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Delete a race
function deleteRace(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM races WHERE id = ?', id, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Clear all races (for sync)
function runStatement(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

// Keeps row ids stable across syncs, because Discord notification de-duplication relies on them.
async function replaceRaces(races) {
  await runStatement('BEGIN IMMEDIATE');
  try {
    for (const race of races) {
      await runStatement(
        `
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
        `,
        [
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
        ]
      );
    }

    const placeholders = races.map(() => '?').join(', ');
    // The calendar feed drops old events after a few weeks, but finished weekends stay listable.
    await runStatement(
      `DELETE FROM races WHERE ics_uid IS NULL OR (ics_uid NOT IN (${placeholders}) AND date >= ?)`,
      [...races.map((race) => race.ics_uid), new Date().toISOString()]
    );
    await runStatement('COMMIT');
  } catch (error) {
    await runStatement('ROLLBACK');
    throw error;
  }
}

module.exports = {
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
