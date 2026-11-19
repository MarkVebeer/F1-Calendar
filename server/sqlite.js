const { Database } = require('bun:sqlite');

// bun:sqlite is synchronous; the async wrappers keep every caller's await-based code unchanged.
function openDatabase(filename) {
  const db = new Database(filename, { create: true });
  // During a zero-downtime deploy two releases share these files for a few seconds; wait for locks instead of failing.
  db.exec('PRAGMA busy_timeout = 5000');

  const prepare = (sql) => db.query(sql);

  return {
    raw: db,
    all: async (sql, params = []) => prepare(sql).all(...params),
    // sqlite3 resolved undefined for a missing row, bun:sqlite returns null.
    get: async (sql, params = []) => prepare(sql).get(...params) ?? undefined,
    // Resolves { lastID, changes } like the sqlite3 callback's `this`.
    run: async (sql, params = []) => {
      const { lastInsertRowid, changes } = prepare(sql).run(...params);
      return { lastID: Number(lastInsertRowid), changes };
    },
    exec: async (sql) => {
      db.exec(sql);
    },
    close: () => db.close()
  };
}

module.exports = { openDatabase };
