const fs = require('fs');
const path = require('path');

const BACKUPS_TO_KEEP = 5;

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

async function addColumnIfMissing(db, table, column, definition) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function hasUserTables(db) {
  const rows = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'");
  return rows.length > 0;
}

function pruneBackups(backupDir, name) {
  fs.readdirSync(backupDir)
    .filter((file) => file.startsWith(`${name}-`) && file.endsWith('.db'))
    .sort()
    .slice(0, -BACKUPS_TO_KEEP)
    .forEach((file) => fs.unlinkSync(path.join(backupDir, file)));
}

async function backupDatabase(db, name, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const target = path.join(backupDir, `${name}-${stamp}.db`);
  await run(db, `VACUUM INTO '${target.replace(/'/g, "''")}'`);
  pruneBackups(backupDir, name);
  console.log(`Backed up ${name} database to ${target}`);
}

async function applyMigration(db, name, migration) {
  await run(db, 'BEGIN IMMEDIATE');
  try {
    await migration.up({
      exec: (sql) => exec(db, sql),
      addColumnIfMissing: (table, column, definition) => addColumnIfMissing(db, table, column, definition)
    });
    await run(db, 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [migration.id, Date.now()]);
    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw new Error(`Migration ${migration.id} failed on ${name} database: ${error.message}`);
  }
  console.log(`Applied database migration ${migration.id}`);
}

// Applies pending migrations in order. Ids are stable: never rename or edit an applied one.
async function migrate(db, { name, migrations, backupDir }) {
  await run(db, 'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set((await all(db, 'SELECT id FROM schema_migrations')).map((row) => row.id));
  const pending = migrations.filter((migration) => !applied.has(migration.id));

  if (pending.length === 0) {
    return;
  }

  if (await hasUserTables(db)) {
    await backupDatabase(db, name, backupDir);
  }

  for (const migration of pending) {
    await applyMigration(db, name, migration);
  }
}

module.exports = { migrate };
