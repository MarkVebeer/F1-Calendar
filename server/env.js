const fs = require('fs');
const path = require('path');

// Values set by the host (for example Pelican) win over .env, which is only for rarely changed settings.
require('dotenv').config();

const PROJECT_ROOT = path.join(__dirname, '..');
const { env } = process;

if (env.SERVER_PORT) {
  env.PORT = env.SERVER_PORT;
}

const publicUrl = (env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
if (publicUrl) {
  env.FRONTEND_URL ||= publicUrl;
  env.PUBLIC_APP_URL ||= publicUrl;
  env.DISCORD_REDIRECT_URI ||= `${publicUrl}/api/discord/callback`;
}

const dataDir = path.resolve(PROJECT_ROOT, env.DATA_DIR || './data');
env.DATA_DIR = dataDir;
env.TRACK_DATA_DIR ||= path.join(dataDir, 'tracks');
fs.mkdirSync(dataDir, { recursive: true });

module.exports = { dataDir };
