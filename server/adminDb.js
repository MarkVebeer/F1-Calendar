const crypto = require('crypto');
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
  },
  {
    // Admin and Discord dashboard logins, kept here so they survive restarts and deploys.
    id: 'admin_003_sessions',
    up: (tx) => tx.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
    `)
  }
];

// Only a hash of the cookie value is stored, so a leaked database cannot be used to log in.
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

async function createSession(kind, subject, ttlMs) {
  const token = crypto.randomBytes(24).toString('hex');
  await adminDb.run(
    'INSERT INTO sessions (token_hash, kind, subject, expires_at) VALUES (?, ?, ?, ?)',
    [hashToken(token), kind, String(subject), Date.now() + ttlMs]
  );
  return token;
}

// Returns { subject, expiresAt } or undefined. Expired sessions are returned too, so callers can say so.
async function getSession(kind, token) {
  if (!token) return undefined;
  const row = await adminDb.get('SELECT subject, expires_at FROM sessions WHERE token_hash = ? AND kind = ?', [hashToken(token), kind]);
  return row ? { subject: row.subject, expiresAt: row.expires_at } : undefined;
}

async function deleteSession(kind, token) {
  if (!token) return;
  await adminDb.run('DELETE FROM sessions WHERE token_hash = ? AND kind = ?', [hashToken(token), kind]);
}

// Logs a user out everywhere, optionally keeping the session that made the request.
async function deleteSessionsFor(kind, subject, exceptToken = null) {
  await adminDb.run(
    'DELETE FROM sessions WHERE kind = ? AND subject = ? AND token_hash != ?',
    [kind, String(subject), exceptToken ? hashToken(exceptToken) : '']
  );
}

async function deleteExpiredSessions() {
  await adminDb.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
}

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

  // Sessions now outlive restarts, so a renamed admin or a new password must log the old sessions out.
  await adminDb.run("DELETE FROM sessions WHERE kind = 'admin' AND subject != ?", [username]);
  const existing = await getAdminByUsername(username);
  if (existing && (await Bun.password.verify(password, existing.password_hash))) {
    console.log(`Admin user synced from env: ${username}`);
    return;
  }
  await deleteSessionsFor('admin', username);

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
  updateAdminPassword,
  createSession,
  getSession,
  deleteSession,
  deleteSessionsFor,
  deleteExpiredSessions
};
