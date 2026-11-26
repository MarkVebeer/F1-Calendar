require('./env');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const discordDb = require('./discordDb');
const adminDb = require('./adminDb');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const discord = require('./discordService');
const { startDiscordPresence } = require('./discordPresence');
const { refreshTracks, refreshWeather, startScheduler } = require('./scheduler');
const { findTrackFile, loadRegistry } = require('./tracks/registry');
const { syncCalendar, getSyncStatus } = require('./icsParser');
const { runDiscordNotifications } = require('./discordWorker');
const { searchLocation, fetchBasicDayForecast, pickDayForecast, buildMeteogramImageUrl } = require('./meteoblueService');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : (IS_PRODUCTION && !FRONTEND_URL.includes('localhost') && !FRONTEND_URL.includes('127.0.0.1'));
const CLIENT_DIST_PATH = path.join(__dirname, '..', 'client', 'dist');

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (!IS_PRODUCTION) {
      return callback(null, true);
    }

    if (allowAllOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS policy blocked this origin'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false
});

// Sessions live in the admin database, so logins survive restarts and zero-downtime deploys.
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DISCORD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

setInterval(() => {
  adminDb.deleteExpiredSessions().catch((error) => console.error('Failed to remove expired sessions:', error.message || error));
}, 15 * 60 * 1000).unref();

// Resolves the session for `kind`, or answers 401 and resolves null.
async function loadSession(kind, token, res) {
  const session = await adminDb.getSession(kind, token);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (Date.now() > session.expiresAt) {
    await adminDb.deleteSession(kind, token);
    res.status(401).json({ error: 'Session expired' });
    return null;
  }
  return session;
}

function getDiscordToken(req) {
  if (req.cookies && req.cookies.discord_session) {
    return req.cookies.discord_session;
  }
  return null;
}

async function requireDiscordAuth(req, res, next) {
  try {
    const session = await loadSession('discord', getDiscordToken(req), res);
    if (!session) return;
    req.discordUserId = session.subject;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function getValidDiscordAccessToken(user) {
  const expiresAt = user.token_expires_at ? Date.parse(user.token_expires_at) : 0;
  if (user.access_token && expiresAt > Date.now() + 60 * 1000) {
    return user.access_token;
  }

  if (!user.refresh_token) {
    throw new Error('Discord OAuth refresh token is missing');
  }

  const tokenData = await discord.refreshDiscordToken(user.refresh_token);
  const refreshToken = tokenData.refresh_token || user.refresh_token;
  const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await discordDb.updateDiscordUserTokens(user.discord_id, {
    access_token: tokenData.access_token,
    refresh_token: refreshToken,
    token_expires_at: tokenExpiresAt
  });

  return tokenData.access_token;
}

function getAdminToken(req) {
  if (req.cookies && req.cookies.admin_session) {
    return req.cookies.admin_session;
  }
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

async function requireAdmin(req, res, next) {
  try {
    const session = await loadSession('admin', getAdminToken(req), res);
    if (!session) return;
    req.adminUsername = session.subject;
    return next();
  } catch (error) {
    return next(error);
  }
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return null;
  }
  return num.toFixed(digits);
}

function formatValue(value, unit, digits = 1) {
  const formatted = formatNumber(value, digits);
  if (formatted === null) {
    return '—';
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function resolveUnit(units, ...keys) {
  for (const key of keys) {
    if (units && units[key]) {
      return units[key];
    }
  }
  return '';
}

const PAST_WEEKENDS_SETTING = 'past_weekends_visible';
const DEFAULT_PAST_WEEKENDS_VISIBLE = 1;
const MAX_PAST_WEEKENDS_VISIBLE = 24;

// API Routes
app.get('/api/site-settings', async (req, res) => {
  try {
    const stored = await adminDb.getSetting(PAST_WEEKENDS_SETTING);
    res.json({ pastWeekendsVisible: stored === null ? DEFAULT_PAST_WEEKENDS_VISIBLE : Number(stored) });
  } catch (error) {
    console.error('Error fetching site settings:', error);
    res.status(500).json({ error: 'Failed to fetch site settings' });
  }
});

app.put('/api/admin/site-settings', requireAdmin, async (req, res) => {
  const value = req.body?.pastWeekendsVisible;
  if (!Number.isInteger(value) || value < 0 || value > MAX_PAST_WEEKENDS_VISIBLE) {
    return res.status(400).json({ error: `pastWeekendsVisible must be a whole number from 0 to ${MAX_PAST_WEEKENDS_VISIBLE}` });
  }

  try {
    await adminDb.setSetting(PAST_WEEKENDS_SETTING, value);
    return res.json({ pastWeekendsVisible: value });
  } catch (error) {
    console.error('Error saving site settings:', error);
    return res.status(500).json({ error: 'Failed to save site settings' });
  }
});

app.get('/api/tracks/meta', (req, res) => {
  res.json({ osmUsed: loadRegistry().circuits.some((circuit) => circuit.geometrySource === 'osm') });
});

app.get(/^\/api\/tracks\/([a-z0-9_-]+)\.(svg|png)$/, (req, res) => {
  const file = findTrackFile(req.params[0], req.params[1]);
  if (!file) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.set('Cache-Control', 'public, max-age=86400');
  return res.sendFile(file);
});

app.get('/api/races', async (req, res) => {
  try {
    const events = await db.getAllEvents();
    res.json(events);
  } catch (error) {
    console.error('Error fetching races:', error);
    res.status(500).json({ error: 'Failed to fetch races' });
  }
});

// Stored daily forecasts per weekend ("2026/losail"); refreshed by a background job, never fetched here.
app.get('/api/weather', async (req, res) => {
  try {
    const enabled = Boolean(process.env.METEOBLUE_API_KEY);
    res.set('Cache-Control', 'public, max-age=600');
    res.json({ enabled, forecasts: enabled ? await db.getWeatherForecasts() : {} });
  } catch (error) {
    console.error('Error fetching weather forecasts:', error);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

app.post('/api/races', requireAdmin, async (req, res) => {
  try {
    const { name, location, date, end_date, type } = req.body;
    const id = await db.addRace({ name, location, date, end_date, type });
    res.status(201).json({ id, name, location, date, end_date, type });
  } catch (error) {
    console.error('Error adding race:', error);
    res.status(500).json({ error: 'Failed to add race' });
  }
});

app.delete('/api/races/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteRace(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting race:', error);
    res.status(500).json({ error: 'Failed to delete race' });
  }
});

// Admin auth
app.use('/api/admin/login', authLimiter);
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const admin = await adminDb.getAdminByUsername(username);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await Bun.password.verify(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = await adminDb.createSession('admin', username, ADMIN_SESSION_TTL_MS);
    res.cookie('admin_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: ADMIN_SESSION_TTL_MS
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  res.json({ success: true, username: req.adminUsername });
});

app.post('/api/admin/logout', requireAdmin, async (req, res, next) => {
  try {
    await adminDb.deleteSession('admin', getAdminToken(req));
    res.clearCookie('admin_session');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (newPassword.length < 10) {
      return res.status(400).json({ error: 'Password too short (min 10 chars)' });
    }

    const admin = await adminDb.getAdminByUsername(username);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const isValid = await Bun.password.verify(currentPassword, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const newHash = await Bun.password.hash(newPassword, { algorithm: 'bcrypt', cost: 12 });
    await adminDb.updateAdminPassword(username, newHash);
    // A new password logs out every other browser; this one stays signed in.
    await adminDb.deleteSessionsFor('admin', username, getAdminToken(req));
    res.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Admin - manage custom events
app.get('/api/admin/custom-events', requireAdmin, async (req, res) => {
  try {
    const events = await db.getAllEvents();
    const customEvents = events.filter(event => event.source === 'custom');
    res.json(customEvents);
  } catch (error) {
    console.error('Error fetching custom events:', error);
    res.status(500).json({ error: 'Failed to fetch custom events' });
  }
});

// Admin - get all events (races + custom) for testing notifications
app.get('/api/admin/all-events', requireAdmin, async (req, res) => {
  try {
    const events = await db.getAllEvents();
    res.json(events);
  } catch (error) {
    console.error('Error fetching all events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.post('/api/admin/custom-events', requireAdmin, async (req, res) => {
  try {
    const { name, location, date, end_date, type, description } = req.body;
    if (!name || !date) {
      return res.status(400).json({ error: 'Name and date are required' });
    }

    const id = await db.addCustomEvent({ name, location, date, end_date, type, description });
    res.status(201).json({ id, name, location, date, end_date: end_date || null, type: type || 'custom', description });
  } catch (error) {
    console.error('Error adding custom event:', error);
    res.status(500).json({ error: 'Failed to add custom event' });
  }
});

app.delete('/api/admin/custom-events/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteCustomEvent(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting custom event:', error);
    res.status(500).json({ error: 'Failed to delete custom event' });
  }
});

// When the calendar last synced, whether it worked, and the error if it did not.
app.get('/api/admin/sync-status', requireAdmin, async (req, res) => {
  try {
    res.json({ status: await getSyncStatus() });
  } catch (error) {
    console.error('Error reading sync status:', error);
    res.status(500).json({ error: 'Failed to read sync status' });
  }
});

app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  try {
    await syncCalendar();
    res.json({ message: 'Calendar synced successfully', status: await getSyncStatus() });
  } catch (error) {
    console.error('Error syncing calendar:', error);
    res.status(500).json({ error: error.message || 'Failed to sync calendar', status: await getSyncStatus() });
  }
});

// Discord OAuth
app.use('/api/discord/login', authLimiter);
app.use('/api/discord/callback', authLimiter);

app.get('/api/discord/login', async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('discord_oauth_state', state, { httpOnly: true, sameSite: 'lax' });
  res.redirect(discord.buildDiscordAuthUrl(state));
});

app.get('/api/discord/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || req.cookies.discord_oauth_state !== state) {
      return res.status(400).send('Invalid OAuth state');
    }
    res.clearCookie('discord_oauth_state');

    const tokenData = await discord.exchangeCodeForToken(code);
    const user = await discord.fetchDiscordUser(tokenData.access_token);

    await discordDb.upsertDiscordUser({
      discord_id: user.id,
      username: user.username,
      avatar: user.avatar,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    });

    const sessionToken = await adminDb.createSession('discord', user.id, DISCORD_SESSION_TTL_MS);
    res.cookie('discord_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: DISCORD_SESSION_TTL_MS
    });

    res.redirect(`${FRONTEND_URL}/#discord`);
  } catch (error) {
    console.error('Discord OAuth callback error:', error.message || error);
    res.status(500).send('Discord authentication failed');
  }
});

app.post('/api/discord/logout', requireDiscordAuth, async (req, res, next) => {
  try {
    await adminDb.deleteSession('discord', getDiscordToken(req));
    res.clearCookie('discord_session');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/discord/me', requireDiscordAuth, async (req, res) => {
  const user = await discordDb.getDiscordUserById(req.discordUserId);
  const avatarUrl = user.avatar 
    ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discord_id) % 5}.png`;
  
  res.json({
    id: user.discord_id,
    username: user.username,
    avatar: user.avatar,
    avatarUrl: avatarUrl
  });
});

app.get('/api/discord/guilds', requireDiscordAuth, async (req, res) => {
  try {
    const user = await discordDb.getDiscordUserById(req.discordUserId);
    const accessToken = await getValidDiscordAccessToken(user);
    const guilds = await discord.fetchUserGuilds(accessToken);
    res.json(guilds);
  } catch (error) {
    console.error('Failed to fetch guilds:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

app.get('/api/discord/admin-guilds', requireDiscordAuth, async (req, res) => {
  try {
    const user = await discordDb.getDiscordUserById(req.discordUserId);
    const accessToken = await getValidDiscordAccessToken(user);
    const guilds = await discord.fetchUserGuilds(accessToken);
    
    // Szűrjük csak az admin jogokkal rendelkező szervereket
    // Administrator permission = 8 (bitwise)
    const adminGuilds = guilds.filter(guild => {
      const permissions = BigInt(guild.permissions || 0);
      return guild.owner === true || (permissions & 8n) === 8n;
    });
    
    // Ellenőrizzük, hogy a bot benne van-e az egyes szerveren
    const guildWithBotCheck = await Promise.all(
      adminGuilds.map(async (guild) => {
        const botInGuild = await discord.isBotInGuild(guild.id);
        return { ...guild, botInGuild };
      })
    );
    
    // By default only servers that already have the bot; ?include=all also lists the ones to invite it to.
    if (req.query.include === 'all') {
      return res.json(guildWithBotCheck);
    }
    const activeGuilds = guildWithBotCheck.filter(guild => guild.botInGuild);
    
    res.json(activeGuilds);
  } catch (error) {
    console.error('Failed to fetch admin guilds:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch admin guilds' });
  }
});

// Admin endpoint to list guilds for testing notifications
app.get('/api/admin/discord-guilds', requireAdmin, async (req, res) => {
  try {
    const configs = await discordDb.getDiscordConfigs();
    const guilds = configs.map(config => ({
      id: config.guild_id,
      name: config.guild_id // We don't have the name stored, use ID
    }));
    res.json(guilds);
  } catch (error) {
    console.error('Failed to fetch guilds for admin:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

app.get('/api/discord/guilds/:guildId/channels', requireDiscordAuth, async (req, res) => {
  try {
    const channels = await discord.fetchGuildChannels(req.params.guildId);
    const textChannels = channels.filter((c) => c.type === 0);
    res.json(textChannels);
  } catch (error) {
    console.error('Failed to fetch channels:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.get('/api/discord/guilds/:guildId/roles', requireDiscordAuth, async (req, res) => {
  try {
    const roles = await discord.fetchGuildRoles(req.params.guildId);
    res.json(roles);
  } catch (error) {
    console.error('Failed to fetch roles:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

app.get('/api/discord/config/:guildId', requireDiscordAuth, async (req, res) => {
  try {
    const config = await discordDb.getDiscordConfigByGuild(req.params.guildId);
    res.json(config || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get config' });
  }
});

app.get('/api/discord/weather-config/:guildId', requireDiscordAuth, async (req, res) => {
  try {
    const config = await discordDb.getWeatherConfigByGuild(req.params.guildId);
    res.json(config || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get weather config' });
  }
});

app.post('/api/discord/config', requireDiscordAuth, async (req, res) => {
  try {
    const { guild_id, channel_id, lead_minutes, timezone, role_id, role_map } = req.body;
    if (!guild_id || !channel_id || !lead_minutes || !timezone) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    await discordDb.upsertDiscordConfig({
      guild_id,
      channel_id,
      lead_minutes,
      timezone,
      role_id: role_id || null,
      role_map: role_map || {}
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save config:', error.message || error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

app.post('/api/discord/weather-config', requireDiscordAuth, async (req, res) => {
  try {
    const { guild_id, channel_id, enabled, role_id, race_day_lead_minutes } = req.body;
    if (!guild_id) {
      return res.status(400).json({ error: 'Missing guild_id' });
    }

    let raceDayLeadValue = null;
    if (race_day_lead_minutes !== undefined && race_day_lead_minutes !== null && race_day_lead_minutes !== '') {
      const parsedMinutes = Number(race_day_lead_minutes);
      if (!Number.isNaN(parsedMinutes) && parsedMinutes > 0) {
        raceDayLeadValue = Math.max(5, Math.min(1440, parsedMinutes)); // 5 perc és 24 óra között
      }
    }

    // String vagy bool konverzió
    const enabledValue = enabled === 'true' ? true : Boolean(enabled);

    await discordDb.upsertWeatherConfig({
      guild_id,
      channel_id: channel_id || null,
      enabled: enabledValue,
      role_id: role_id || null,
      race_day_lead_minutes: raceDayLeadValue
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save weather config:', error.message || error);
    res.status(500).json({ error: 'Failed to save weather config' });
  }
});

app.get('/api/discord/invite-url', (req, res) => {
  // With ?guild_id the Discord invite screen opens with that server already chosen.
  const guildId = /^\d{5,25}$/.test(String(req.query.guild_id || '')) ? String(req.query.guild_id) : undefined;
  const url = discord.buildBotInviteUrl(guildId);
  res.json({ url });
});

// What a reminder will look like, built by the bot's own embed code from the next real session; nothing is sent.
app.post('/api/discord/preview', requireDiscordAuth, async (req, res) => {
  try {
    const { lead_minutes: leadMinutes = 60, event_types: eventTypes, timezone, role_map: roleMap = {}, role_id: roleId } = req.body || {};
    const lead = Math.max(0, Math.min(1440, Number(leadMinutes) || 0));
    const types = Array.isArray(eventTypes) && eventTypes.length ? eventTypes : ['race', 'practice', 'qualifying', 'sprint', 'custom'];
    const upcoming = await db.getUpcomingEvents(24 * 60);
    const race = upcoming.find((event) => types.includes(event.type) && new Date(event.date).getTime() > Date.now());
    if (!race) {
      return res.json({ race: null });
    }

    const { buildRaceEmbed, sessionLink } = require('./discordWorker');
    const embed = await buildRaceEmbed(race, { timezone: timezone || 'UTC' }, lead);
    const mentionRoleId = (roleMap && roleMap[race.type]) || roleId || null;
    res.json({
      race: { name: race.name, type: race.type, date: race.date },
      content: mentionRoleId ? embed.description : null,
      mentionRoleId,
      embed,
      button: { label: discord.websiteButtonLabel(), url: sessionLink(race) }
    });
  } catch (error) {
    console.error('Failed to build message preview:', error.message || error);
    res.status(500).json({ error: 'Failed to build the preview' });
  }
});

app.post('/api/sync', requireAdmin, async (req, res) => {
  try {
    await syncCalendar();
    res.json({ message: 'Calendar synced successfully' });
  } catch (error) {
    console.error('Error syncing calendar:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

app.post('/api/discord/test-notification', requireDiscordAuth, async (req, res) => {
  try {
    const { guild_id } = req.body;
    if (!guild_id) {
      return res.status(400).json({ error: 'Guild ID required' });
    }

    const config = await discordDb.getDiscordConfigByGuild(guild_id);
    if (!config) {
      return res.status(404).json({ error: 'Guild not configured' });
    }

    const testEmbed = {
      title: '🏁 Test Notification',
      description: 'This is a test notification from F1 Calendar.',
      color: 0xe10600,
      fields: [
        { name: 'Channel', value: `<#${config.channel_id}>`, inline: true },
        { name: 'Timezone', value: config.timezone, inline: true }
      ],
      footer: { text: 'F1 Calendar • Discord Notify' }
    };

    await discord.sendChannelMessage(config.channel_id, testEmbed, config.role_id);
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Failed to send test notification:', error.message || error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

app.post('/api/discord/weather-test', requireDiscordAuth, async (req, res) => {
  try {
    const { guild_id } = req.body;
    if (!guild_id) {
      return res.status(400).json({ error: 'Guild ID required' });
    }

    const weatherConfig = await discordDb.getWeatherConfigByGuild(guild_id);
    if (!weatherConfig || !weatherConfig.channel_id) {
      return res.status(404).json({ error: 'Weather notifications not configured' });
    }

    const testEmbed = {
      title: '🌦️ Weather Test Notification',
      description: 'This is a simple weather test notification from F1 Calendar.',
      color: 0x3498db,
      footer: { text: 'F1 Calendar • Discord Notify' }
    };

    await discord.sendChannelMessage(weatherConfig.channel_id, testEmbed, weatherConfig.role_id || null);
    res.json({ success: true, message: 'Weather test notification sent' });
  } catch (error) {
    console.error('Failed to send weather test:', error.message || error);
    res.status(500).json({ error: 'Failed to send weather test' });
  }
});

// Notification management
app.get('/api/discord/notifications/:guildId', requireDiscordAuth, async (req, res) => {
  try {
    const notifications = await discordDb.getNotificationsByGuild(req.params.guildId);
    res.json(notifications);
  } catch (error) {
    console.error('Failed to fetch notifications:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/discord/notifications', requireDiscordAuth, async (req, res) => {
  try {
    const { guild_id, lead_minutes, event_types } = req.body;
    if (!guild_id || lead_minutes === undefined) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const id = await discordDb.addNotification({ guild_id, lead_minutes, event_types });
    res.json({ success: true, id });
  } catch (error) {
    console.error('Failed to add notification:', error.message || error);
    res.status(500).json({ error: 'Failed to add notification' });
  }
});

app.delete('/api/discord/notifications/:id', requireDiscordAuth, async (req, res) => {
  try {
    await discordDb.deleteNotification(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete notification:', error.message || error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Admin test notification by type
app.post('/api/admin/test-notification-type', requireAdmin, async (req, res) => {
  try {
    const { guild_id, event_type, lead_minutes } = req.body;
    if (!guild_id || !event_type || lead_minutes === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const config = await discordDb.getDiscordConfigByGuild(guild_id);
    if (!config) {
      return res.status(404).json({ error: 'Guild not configured' });
    }

    // Create mock race event
    const mockRace = {
      id: 99999,
      name: `Test ${event_type.charAt(0).toUpperCase() + event_type.slice(1)} Event`,
      location: 'Test Circuit',
      city: 'Test City',
      circuit_name: 'Test Circuit Layout',
      date: new Date(Date.now() + lead_minutes * 60 * 1000).toISOString(),
      type: event_type
    };

    // Build embed using worker logic
    const { buildRaceEmbed } = require('./discordWorker');
    const embed = await buildRaceEmbed(mockRace, config, lead_minutes);
    
    // Get role for this event type
    const roleIdForType = config.role_map?.[event_type] || config.role_id || null;
    
    await discord.sendChannelMessage(config.channel_id, embed, roleIdForType);
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Failed to send admin test notification:', error.message || error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Send test notification for real race event
app.post('/api/admin/send-test-race-notification', requireAdmin, async (req, res) => {
  try {
    const { channel_id, race_id, lead_minutes } = req.body;
    if (!channel_id || !race_id || lead_minutes === undefined) {
      return res.status(400).json({ error: 'Missing required fields: channel_id, race_id, lead_minutes' });
    }

    // Get race from database
    const races = await db.getAllEvents();
    const race = races.find(r => r.id === parseInt(race_id));
    
    if (!race) {
      return res.status(404).json({ error: 'Race not found' });
    }

    // Get discord server config for this channel
    const config = await discordDb.getDiscordConfigByChannelId(channel_id);
    if (!config) {
      return res.status(400).json({ error: 'Channel not configured in any Discord server' });
    }

    // Build embed using worker logic
    const { buildRaceEmbed } = require('./discordWorker');
    const embed = await buildRaceEmbed(race, config, lead_minutes);
    
    // Get role for this event type
    const roleIdForType = config.role_map?.[race.type] || config.role_id || null;
    
    await discord.sendChannelMessage(channel_id, embed, roleIdForType);
    res.json({ success: true, message: 'Test race notification sent' });
  } catch (error) {
    console.error('Failed to send test race notification:', error.message || error);
    res.status(500).json({ error: 'Failed to send test notification: ' + error.message });
  }
});

// Admin debug: fetch Meteoblue weather and send to Discord
app.post('/api/admin/weather-debug', requireAdmin, async (req, res) => {
  try {
    const { city, date, channel_id } = req.body;
    if (!city || !date || !channel_id) {
      return res.status(400).json({ error: 'Missing required fields: city, date, channel_id' });
    }

    const location = await searchLocation(city);
    const forecast = await fetchBasicDayForecast({
      lat: location.lat,
      lon: location.lon,
      asl: location.asl,
      tz: location.timezone,
      name: location.name
    });

    const dayForecast = pickDayForecast(forecast, date);
    if (!dayForecast) {
      return res.status(404).json({ error: 'No forecast available for the requested date' });
    }

    const { values, units } = dayForecast;

    const temperatureUnit = resolveUnit(units, 'temperature', 'temperature_max', 'temperature_min', 'temperature_mean');
    const precipitationUnit = resolveUnit(units, 'precipitation_sum', 'precipitation', 'precipitation_amount');
    const windspeedUnit = resolveUnit(units, 'windspeed_mean', 'windspeed', 'windspeed_max');

    const temperatureTextParts = [];
    if (values.temperature_min !== undefined) {
      temperatureTextParts.push(formatValue(values.temperature_min, temperatureUnit));
    }
    if (values.temperature_max !== undefined) {
      temperatureTextParts.push(formatValue(values.temperature_max, temperatureUnit));
    }
    if (values.temperature_mean !== undefined) {
      temperatureTextParts.push(formatValue(values.temperature_mean, temperatureUnit));
    }
    const temperatureText = temperatureTextParts.length > 0 ? temperatureTextParts.join(' • ') : '—';

    const precipitationValue = values.precipitation_sum !== undefined ? values.precipitation_sum : values.precipitation;
    const precipitationText = precipitationValue !== undefined
      ? formatValue(precipitationValue, precipitationUnit)
      : '—';

    const precipitationProbabilityText = values.precipitation_probability !== undefined
      ? `${formatNumber(values.precipitation_probability, 0)} %`
      : '—';

    const windTextParts = [];
    if (values.windspeed_mean !== undefined) {
      windTextParts.push(formatValue(values.windspeed_mean, windspeedUnit));
    }
    if (values.windspeed_max !== undefined) {
      windTextParts.push(formatValue(values.windspeed_max, windspeedUnit));
    }
    const windText = windTextParts.length > 0 ? windTextParts.join(' • ') : '—';

    const locationName = [location.name, location.admin1, location.country]
      .filter(Boolean)
      .join(', ');

    const meteogramUrl = buildMeteogramImageUrl({
      lat: location.lat,
      lon: location.lon,
      asl: location.asl,
      tz: location.timezone,
      name: location.name,
      forecastDays: 1
    });

    const combinedPrecipitationText = precipitationText !== '—' && precipitationProbabilityText !== '—'
      ? `${precipitationText} • ${precipitationProbabilityText}`
      : (precipitationText !== '—' ? precipitationText : precipitationProbabilityText);

    const embed = {
      title: '🌦️ Weather forecast',
      description: `${locationName}\n${date}`,
      color: 0x4aa3ff,
      fields: [
        { name: 'Temperature\n(min, max, avg)', value: temperatureText, inline: true },
        { name: 'Precipitation', value: combinedPrecipitationText, inline: true },
        { name: 'Wind\n(avg, max)', value: windText, inline: true }
      ],
      image: { url: meteogramUrl },
      footer: { text: `meteoblue • ${location.timezone || 'UTC'}` }
    };

    await discord.sendChannelMessage(channel_id, embed);

    res.json({
      success: true,
      location: {
        name: location.name,
        admin1: location.admin1,
        country: location.country,
        lat: location.lat,
        lon: location.lon,
        asl: location.asl,
        timezone: location.timezone
      },
      date,
      values,
      units
    });
  } catch (error) {
    console.error('Weather debug failed:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to fetch weather data' });
  }
});

if (IS_PRODUCTION && fs.existsSync(CLIENT_DIST_PATH)) {
  app.use(express.static(CLIENT_DIST_PATH));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
  });
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

async function initCore() {
  await Promise.all([db.initDatabase(), adminDb.initAdminDatabase(), discordDb.initDiscordDatabase()]);
  console.log('Databases initialized');
}

// The calendar sync, the cron jobs and the Discord bot. Only one process may run these at a time.
let jobsStarted = false;
async function startJobs() {
  if (jobsStarted) return;
  jobsStarted = true;

  try {
    await syncCalendar();
    console.log('Initial calendar sync completed');
  } catch (error) {
    console.error('Initial calendar sync failed, continuing startup:', error.message || error);
  }

  startScheduler();
  console.log('Scheduler started - will sync every hour');

  // Run in the background so a slow or unavailable data source cannot delay startup.
  refreshTracks();
  refreshWeather();

  startDiscordPresence();
  console.log('Discord presence started');
}

async function startServer() {
  await initCore();

  // Under deploy/supervisor.js a new release serves traffic first and takes over the jobs
  // only once the previous release has exited, so notifications are never sent twice.
  const waitForJobs = process.env.F1_JOBS === 'wait';
  if (!waitForJobs) {
    await startJobs();
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    // Keep-alive connections from the deploy proxy would otherwise hold close() open.
    server.closeIdleConnections?.();

    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Messages from deploy/supervisor.js. Signals are unreliable on Windows, so it uses IPC instead.
  process.on('message', (message) => {
    if (message?.type === 'shutdown') {
      shutdown('Supervisor shutdown');
    } else if (message?.type === 'start-jobs') {
      startJobs().catch((error) => console.error('Failed to start background jobs:', error));
    }
  });

  return server;
}

// Run server/main.js (dev) or startprod.js, not this file: Bun would treat the exported `app` as a Bun.serve() config.
module.exports = {
  app,
  startServer
};
