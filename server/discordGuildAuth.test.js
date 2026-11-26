// The Discord dashboard routes act on a server only for a user who owns or administers it on Discord.
const { test, beforeAll, afterAll, beforeEach } = require('bun:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-guild-auth-'));
Object.assign(process.env, {
  DATA_DIR: dataDir,
  TRACK_DATA_DIR: path.join(dataDir, 'tracks'),
  DISCORD_BOT_TOKEN: ''
});

const { app } = require('./index');
const adminDb = require('./adminDb');
const discordDb = require('./discordDb');
const discord = require('./discordService');

const OWNED = '100000000000000001';
const ADMINISTERED = '100000000000000002';
const MEMBER_ONLY = '100000000000000003';
const NOT_A_MEMBER = '100000000000000004';

const CHANNELS = {
  [OWNED]: [{ id: '501', name: 'f1', type: 0 }],
  [ADMINISTERED]: [{ id: '502', name: 'f1', type: 0 }],
  [MEMBER_ONLY]: [{ id: '503', name: 'f1', type: 0 }]
};

// Discord is replaced by fakes: the user's server list, each server's channels, and posting.
const calls = { userGuilds: 0, sent: [] };
let userGuildsFails = false;
discord.fetchUserGuilds = async () => {
  calls.userGuilds += 1;
  if (userGuildsFails) throw new Error('Discord is down');
  return [
    { id: OWNED, name: 'Owned', owner: true, permissions: '0' },
    { id: ADMINISTERED, name: 'Administered', owner: false, permissions: '8' },
    { id: MEMBER_ONLY, name: 'Member', owner: false, permissions: '1024' }
  ];
};
discord.fetchGuildChannels = async (guildId) => CHANNELS[guildId] || [];
discord.fetchGuildRoles = async () => [];
discord.sendChannelMessage = async (channelId) => {
  calls.sent.push(channelId);
};

let server;
let baseUrl;
let userCount = 0;

beforeAll(async () => {
  await Promise.all([adminDb.initAdminDatabase(), discordDb.initDiscordDatabase()]);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  userGuildsFails = false;
  calls.userGuilds = 0;
  calls.sent = [];
});

// A fresh Discord user per test, so the per-user permission cache starts empty.
async function signIn() {
  userCount += 1;
  const id = `90000000000000000${userCount}`;
  await discordDb.upsertDiscordUser({
    discord_id: id,
    username: `tester-${userCount}`,
    avatar: null,
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
  });
  const token = await adminDb.createSession('discord', id, 3600 * 1000);
  return `discord_session=${token}`;
}

function call(cookie, method, url, body) {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

const config = (guild, channel) => ({ guild_id: guild, channel_id: channel, lead_minutes: 60, timezone: 'UTC', role_map: {} });

test('reading a server needs a session and owner or Administrator rights', async () => {
  const cookie = await signIn();
  assert.strictEqual((await call(null, 'GET', `/api/discord/config/${OWNED}`)).status, 401);
  for (const guild of [OWNED, ADMINISTERED]) {
    for (const route of ['config', 'weather-config', 'notifications', 'guilds/:id/channels', 'guilds/:id/roles']) {
      const url = route.includes(':id') ? `/api/discord/${route.replace(':id', guild)}` : `/api/discord/${route}/${guild}`;
      assert.strictEqual((await call(cookie, 'GET', url)).status, 200, url);
    }
  }
  for (const guild of [MEMBER_ONLY, NOT_A_MEMBER]) {
    for (const url of [`/api/discord/config/${guild}`, `/api/discord/weather-config/${guild}`, `/api/discord/notifications/${guild}`, `/api/discord/guilds/${guild}/channels`, `/api/discord/guilds/${guild}/roles`]) {
      const response = await call(cookie, 'GET', url);
      assert.strictEqual(response.status, 403, url);
      assert.match((await response.json()).error, /do not own or administer/);
    }
  }
});

test('settings cannot be saved for a server the user does not manage', async () => {
  const cookie = await signIn();
  assert.strictEqual((await call(cookie, 'POST', '/api/discord/config', config(MEMBER_ONLY, '503'))).status, 403);
  assert.strictEqual((await call(cookie, 'POST', '/api/discord/weather-config', { guild_id: MEMBER_ONLY, enabled: true })).status, 403);
  assert.strictEqual((await call(cookie, 'POST', '/api/discord/notifications', { guild_id: NOT_A_MEMBER, lead_minutes: 30 })).status, 403);
  assert.strictEqual(await discordDb.getDiscordConfigByGuild(MEMBER_ONLY), undefined);
  assert.deepStrictEqual(await discordDb.getNotificationsByGuild(NOT_A_MEMBER), []);

  assert.strictEqual((await call(cookie, 'POST', '/api/discord/config', config(OWNED, '501'))).status, 200);
  assert.strictEqual((await discordDb.getDiscordConfigByGuild(OWNED)).channel_id, '501');
});

test('a channel from another server is refused', async () => {
  const cookie = await signIn();
  const reminders = await call(cookie, 'POST', '/api/discord/config', config(ADMINISTERED, '503'));
  assert.strictEqual(reminders.status, 400);
  assert.match((await reminders.json()).error, /not on this server/);
  const weather = await call(cookie, 'POST', '/api/discord/weather-config', { guild_id: ADMINISTERED, channel_id: '501', enabled: true });
  assert.strictEqual(weather.status, 400);
  assert.strictEqual(await discordDb.getWeatherConfigByGuild(ADMINISTERED), null);
});

test('test messages go out only for a managed server', async () => {
  const cookie = await signIn();
  await discordDb.upsertDiscordConfig(config(MEMBER_ONLY, '503'));
  await discordDb.upsertWeatherConfig({ guild_id: MEMBER_ONLY, channel_id: '503', enabled: true });
  assert.strictEqual((await call(cookie, 'POST', '/api/discord/test-notification', { guild_id: MEMBER_ONLY })).status, 403);
  assert.strictEqual((await call(cookie, 'POST', '/api/discord/weather-test', { guild_id: MEMBER_ONLY })).status, 403);
  assert.deepStrictEqual(calls.sent, []);

  await call(cookie, 'POST', '/api/discord/config', config(OWNED, '501'));
  assert.strictEqual((await call(cookie, 'POST', '/api/discord/test-notification', { guild_id: OWNED })).status, 200);
  assert.deepStrictEqual(calls.sent, ['501']);
});

test('a reminder time is deleted only by someone who manages its server', async () => {
  const cookie = await signIn();
  const foreign = await discordDb.addNotification({ guild_id: MEMBER_ONLY, lead_minutes: 45 });
  const own = await discordDb.addNotification({ guild_id: OWNED, lead_minutes: 45 });

  assert.strictEqual((await call(cookie, 'DELETE', `/api/discord/notifications/${foreign}`)).status, 403);
  assert.ok(await discordDb.getNotificationById(foreign));
  assert.strictEqual((await call(cookie, 'DELETE', '/api/discord/notifications/999999')).status, 404);
  assert.strictEqual((await call(cookie, 'DELETE', `/api/discord/notifications/${own}`)).status, 200);
  assert.strictEqual(await discordDb.getNotificationById(own), undefined);
});

test('the server list from Discord is fetched once and reused for a minute', async () => {
  const cookie = await signIn();
  for (let i = 0; i < 5; i += 1) {
    await call(cookie, 'GET', `/api/discord/config/${OWNED}`);
  }
  assert.strictEqual(calls.userGuilds, 1);
});

test('when Discord cannot be asked, access is refused rather than guessed', async () => {
  const cookie = await signIn();
  userGuildsFails = true;
  const response = await call(cookie, 'GET', `/api/discord/config/${OWNED}`);
  assert.strictEqual(response.status, 502);
  assert.match((await response.json()).error, /could not confirm/);
});
