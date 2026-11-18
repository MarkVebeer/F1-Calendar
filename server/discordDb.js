const { openDatabase } = require('./sqlite');
const path = require('path');
const { dataDir } = require('./env');
const { migrate } = require('./migrate');

const discordDbPath = path.join(dataDir, 'f1calendar-discord.db');
const discordDb = openDatabase(discordDbPath);

const migrations = [
  {
    // Written to bring a database from any earlier release up to date.
    id: 'discord_001_baseline',
    up: async (tx) => {
      await tx.exec(`
        CREATE TABLE IF NOT EXISTS discord_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          avatar TEXT,
          access_token TEXT,
          refresh_token TEXT,
          token_expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS discord_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT UNIQUE NOT NULL,
          channel_id TEXT NOT NULL,
          lead_minutes INTEGER NOT NULL DEFAULT 60,
          timezone TEXT NOT NULL DEFAULT 'UTC',
          role_id TEXT,
          role_map TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS discord_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          lead_minutes INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (guild_id) REFERENCES discord_configs(guild_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS discord_notify_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          race_id INTEGER NOT NULL,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          lead_minutes INTEGER NOT NULL,
          scheduled_for TEXT NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS discord_weather_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT UNIQUE NOT NULL,
          days_before INTEGER NOT NULL DEFAULT 1,
          hour INTEGER NOT NULL DEFAULT 18,
          enabled INTEGER NOT NULL DEFAULT 0,
          role_id TEXT,
          race_day_lead_minutes INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS discord_weather_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          weekend_key TEXT NOT NULL,
          scheduled_for TEXT NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS discord_race_day_weather_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          race_date TEXT NOT NULL,
          scheduled_for TEXT NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await tx.addColumnIfMissing('discord_configs', 'role_id', 'TEXT');
      await tx.addColumnIfMissing('discord_configs', 'role_map', 'TEXT');
      await tx.addColumnIfMissing('discord_notify_log', 'lead_minutes', 'INTEGER DEFAULT 0');
      await tx.addColumnIfMissing('discord_notifications', 'event_types', `TEXT DEFAULT '["race","practice","qualifying","sprint","custom"]'`);
      await tx.addColumnIfMissing('discord_weather_settings', 'race_day_lead_minutes', 'INTEGER');
      await tx.addColumnIfMissing('discord_weather_settings', 'channel_id', 'TEXT');
      await tx.addColumnIfMissing('discord_weather_settings', 'role_id', 'TEXT');
    }
  }
];

const DEFAULT_EVENT_TYPES = ['race', 'practice', 'qualifying', 'sprint', 'custom'];

function initDiscordDatabase() {
  return migrate(discordDb, { name: 'discord', migrations, backupDir: path.join(dataDir, 'backups') });
}

async function insert(sql, params) {
  const { lastID } = await discordDb.run(sql, params);
  return lastID;
}

async function exists(sql, params) {
  return Boolean(await discordDb.get(sql, params));
}

function upsertDiscordUser({ discord_id, username, avatar, access_token, refresh_token, token_expires_at }) {
  return insert(
    `
      INSERT INTO discord_users (discord_id, username, avatar, access_token, refresh_token, token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET
        username = excluded.username,
        avatar = excluded.avatar,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at
    `,
    [discord_id, username, avatar, access_token, refresh_token, token_expires_at]
  );
}

function getDiscordUserById(discord_id) {
  return discordDb.get('SELECT * FROM discord_users WHERE discord_id = ?', [discord_id]);
}

async function updateDiscordUserTokens(discord_id, { access_token, refresh_token, token_expires_at }) {
  await discordDb.run(
    `UPDATE discord_users
     SET access_token = ?, refresh_token = ?, token_expires_at = ?
     WHERE discord_id = ?`,
    [access_token, refresh_token, token_expires_at, discord_id]
  );
}

function upsertDiscordConfig({ guild_id, channel_id, lead_minutes, timezone, role_id, role_map }) {
  const roleMapJson = role_map ? JSON.stringify(role_map) : null;
  return insert(
    `
      INSERT INTO discord_configs (guild_id, channel_id, lead_minutes, timezone, role_id, role_map, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        lead_minutes = excluded.lead_minutes,
        timezone = excluded.timezone,
        role_id = excluded.role_id,
        role_map = excluded.role_map,
        updated_at = CURRENT_TIMESTAMP
    `,
    [guild_id, channel_id, lead_minutes, timezone, role_id, roleMapJson]
  );
}

async function getDiscordConfigByGuild(guild_id) {
  return normalizeRoleMap(await discordDb.get('SELECT * FROM discord_configs WHERE guild_id = ?', [guild_id]));
}

async function getDiscordConfigByChannelId(channel_id) {
  return normalizeRoleMap(await discordDb.get('SELECT * FROM discord_configs WHERE channel_id = ?', [channel_id]));
}

async function getDiscordConfigs() {
  return (await discordDb.all('SELECT * FROM discord_configs')).map(normalizeRoleMap);
}

function normalizeRoleMap(row) {
  if (!row) return row;
  let roleMap = null;
  if (typeof row.role_map === 'string' && row.role_map.trim() !== '') {
    try {
      roleMap = JSON.parse(row.role_map);
    } catch {
      roleMap = null;
    }
  }
  return { ...row, role_map: roleMap || {} };
}

function wasDiscordNotified({ guild_id, race_id, lead_minutes }) {
  return exists(
    'SELECT id FROM discord_notify_log WHERE guild_id = ? AND race_id = ? AND lead_minutes = ? LIMIT 1',
    [guild_id, race_id, lead_minutes]
  );
}

function logDiscordNotification({ guild_id, race_id, channel_id, lead_minutes, scheduled_for }) {
  return insert(
    `
      INSERT INTO discord_notify_log (guild_id, race_id, channel_id, lead_minutes, scheduled_for)
      VALUES (?, ?, ?, ?, ?)
    `,
    [guild_id, race_id, channel_id, lead_minutes, scheduled_for]
  );
}

// Notification CRUD
function addNotification({ guild_id, lead_minutes, event_types = DEFAULT_EVENT_TYPES }) {
  return insert(
    'INSERT INTO discord_notifications (guild_id, lead_minutes, event_types) VALUES (?, ?, ?)',
    [guild_id, lead_minutes, JSON.stringify(event_types)]
  );
}

async function getNotificationsByGuild(guild_id) {
  const rows = await discordDb.all('SELECT * FROM discord_notifications WHERE guild_id = ? ORDER BY lead_minutes ASC', [guild_id]);
  return rows.map((row) => ({
    ...row,
    event_types: row.event_types ? JSON.parse(row.event_types) : [...DEFAULT_EVENT_TYPES]
  }));
}

async function deleteNotification(id) {
  await discordDb.run('DELETE FROM discord_notifications WHERE id = ?', [id]);
}

async function clearNotificationsByGuild(guild_id) {
  await discordDb.run('DELETE FROM discord_notifications WHERE guild_id = ?', [guild_id]);
}

function upsertWeatherConfig({ guild_id, channel_id, days_before, hour, enabled, role_id, race_day_lead_minutes }) {
  // Default values for backward compatibility
  const daysValue = days_before !== undefined && days_before !== null ? days_before : 0;
  const hourValue = hour !== undefined && hour !== null ? hour : 0;

  return insert(
    `
      INSERT INTO discord_weather_settings (guild_id, channel_id, days_before, hour, enabled, role_id, race_day_lead_minutes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        days_before = excluded.days_before,
        hour = excluded.hour,
        enabled = excluded.enabled,
        role_id = excluded.role_id,
        race_day_lead_minutes = excluded.race_day_lead_minutes,
        updated_at = CURRENT_TIMESTAMP
    `,
    [guild_id, channel_id || null, daysValue, hourValue, enabled ? 1 : 0, role_id || null, race_day_lead_minutes || null]
  );
}

function normalizeWeatherConfig(row) {
  return {
    ...row,
    enabled: Boolean(row.enabled),
    channel_id: row.channel_id || null,
    role_id: row.role_id || null,
    race_day_lead_minutes: row.race_day_lead_minutes || null
  };
}

async function getWeatherConfigByGuild(guild_id) {
  const row = await discordDb.get('SELECT * FROM discord_weather_settings WHERE guild_id = ?', [guild_id]);
  return row ? normalizeWeatherConfig(row) : null;
}

async function getWeatherConfigs() {
  return (await discordDb.all('SELECT * FROM discord_weather_settings')).map(normalizeWeatherConfig);
}

function wasWeatherNotified({ guild_id, weekend_key }) {
  return exists('SELECT id FROM discord_weather_log WHERE guild_id = ? AND weekend_key = ? LIMIT 1', [guild_id, weekend_key]);
}

function logWeatherNotification({ guild_id, weekend_key, scheduled_for }) {
  return insert(
    'INSERT INTO discord_weather_log (guild_id, weekend_key, scheduled_for) VALUES (?, ?, ?)',
    [guild_id, weekend_key, scheduled_for]
  );
}

function wasRaceDayWeatherNotified({ guild_id, race_date }) {
  return exists('SELECT id FROM discord_race_day_weather_log WHERE guild_id = ? AND race_date = ? LIMIT 1', [guild_id, race_date]);
}

function logRaceDayWeatherNotification({ guild_id, race_date, scheduled_for }) {
  return insert(
    'INSERT INTO discord_race_day_weather_log (guild_id, race_date, scheduled_for) VALUES (?, ?, ?)',
    [guild_id, race_date, scheduled_for]
  );
}

module.exports = {
  initDiscordDatabase,
  upsertDiscordUser,
  getDiscordUserById,
  updateDiscordUserTokens,
  upsertDiscordConfig,
  getDiscordConfigByGuild,
  getDiscordConfigByChannelId,
  getDiscordConfigs,
  wasDiscordNotified,
  logDiscordNotification,
  addNotification,
  getNotificationsByGuild,
  deleteNotification,
  clearNotificationsByGuild,
  upsertWeatherConfig,
  getWeatherConfigByGuild,
  getWeatherConfigs,
  wasWeatherNotified,
  logWeatherNotification,
  wasRaceDayWeatherNotified,
  logRaceDayWeatherNotification
};
