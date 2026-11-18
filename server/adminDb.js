const path = require('path');
const { openDatabase } = require('./sqlite');
const { dataDir } = require('./env');
const { migrate } = require('./migrate');

const adminDbPath = path.join(dataDir, 'f1calendar-admin.db');
const adminDb = openDatabase(adminDbPath);

const migrations = [
  {
    id: 'admin_001_baseline',
    up: (tx) => tx.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
  },
  {
    id: 'admin_002_settings',
    up: (tx) => tx.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }
];

async function getSetting(key) {
  const row = await adminDb.get('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await adminDb.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

async function initAdminDatabase() {
  await migrate(adminDb, { name: 'admin', migrations, backupDir: path.join(dataDir, 'backups') });
  await syncAdminFromEnv();
}

async function syncAdminFromEnv() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const password_hash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });

  await adminDb.run(
    `
      INSERT INTO admin_users (username, password_hash)
      VALUES (?, ?)
      ON CONFLICT(username)
      DO UPDATE SET password_hash = excluded.password_hash
    `,
    [username, password_hash]
  );
  console.log(`Admin user synced from env: ${username}`);
}

function getAdminByUsername(username) {
  return adminDb.get('SELECT * FROM admin_users WHERE username = ?', [username]);
}

async function updateAdminPassword(username, password_hash) {
  const { changes } = await adminDb.run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [password_hash, username]);
  return changes;
}

module.exports = {
  initAdminDatabase,
  getAdminByUsername,
  getSetting,
  setSetting,
  updateAdminPassword
};
