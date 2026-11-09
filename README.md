# F1 Calendar

A self-hosted Formula 1 calendar with a web frontend and Discord notifications. It follows the official F1 calendar feed, shows every weekend with its own track drawing, and can post session reminders and weather forecasts to your Discord servers.

The website, API, background jobs and Discord bot all run in a single Node.js process backed by SQLite, so there is nothing else to host.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Quick start (local development)](#quick-start-local-development)
- [Configuration](#configuration)
- [Deploy on Pelican Panel](#deploy-on-pelican-panel)
- [Deploy on your own server](#deploy-on-your-own-server)
- [Set up Discord](#set-up-discord)
- [Set up weather forecasts](#set-up-weather-forecasts)
- [Using the app](#using-the-app)
- [Track data and drawings](#track-data-and-drawings)
- [Data, backups and migrations](#data-backups-and-migrations)
- [API overview](#api-overview)
- [Project layout](#project-layout)
- [Development commands](#development-commands)
- [Troubleshooting](#troubleshooting)
- [Credits and licences](#credits-and-licences)

## Features

**Calendar**
- Syncs practice, qualifying, sprint and race sessions from the official F1 calendar feed every hour.
- Groups sessions into race weekends and separates seasons with a labelled divider.
- Highlights the current or next weekend with a live countdown.
- Shows finished weekends in a dimmed style. An admin setting controls how many stay in the list.
- Search by Grand Prix, country, city or circuit, including weekends hidden from the list.
- Each visitor can pick a display timezone, remembered in their browser.

**Tracks**
- Draws every circuit as its own SVG and PNG, served from the app itself.
- Picks up new circuits automatically. If an external source goes away, existing tracks keep working.

**Discord**
- Sign in with Discord and configure every server you own or administer.
- Several reminders per server, for example 60, 10 and 0 minutes before a session, each limited to chosen session types.
- A separate role mention for each session type.
- Weekend and race-day weather forecasts in their own channel.

**Administration**
- Add your own custom events alongside the F1 sessions.
- Trigger a calendar refresh and change list settings from an admin panel.
- Versioned database migrations with an automatic backup before they run.
- A ready-made [Pelican](https://pelican.dev) egg, configured entirely from the panel.

## How it works

```text
F1 calendar feed ──── hourly ───▶ events matched to circuits ──▶ SQLite ──┐
                                            ▲                             ├─▶ website
Jolpica API ──────┐                         │                             └─▶ Discord
bacinger GeoJSON ─┼── daily ───▶ circuit list + SVG/PNG drawings ──▶ /api/tracks
OpenStreetMap ────┘
```

| Job | When | What it does |
|---|---|---|
| Calendar sync | Startup and every hour | Downloads the feed, matches events to circuits and updates the races table |
| Track sync | Startup and daily at 04:15 server time | Refreshes the circuit list and generates new or changed drawings |
| Notifications | Every minute | Sends due session reminders and weather forecasts |

Requests are only ever served from local data. External sources are used by the background jobs, and when one fails the app keeps its last good copy.

**Stack:** Node.js, Express, SQLite (`sqlite3`), React, Vite, `node-cron`, `node-ical` and `resvg`.

## Quick start (local development)

You need [Node.js](https://nodejs.org) 22 or newer and Git.

```bash
git clone https://github.com/MarkVebeer/F1-Calendar.git
cd F1-Calendar
npm install
npm --prefix client install
npm run dev
```

Open <http://localhost:3001>. The frontend runs on port 3001 and proxies `/api` to the backend on port 3002.

No configuration is needed for the calendar itself. In development the admin login defaults to `admin` / `admin123`, and databases are created in `data/`.

To try Discord or weather features locally, create a `.env` file in the project root:

```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_REDIRECT_URI=http://localhost:3001/api/discord/callback
METEOBLUE_API_KEY=your_api_key
```

## Configuration

Settings come from environment variables. A `.env` file in the project root is also read, but values already set in the environment take priority over it. [`.env.example`](.env.example) is a starting point.

### Core settings

| Variable | Required in production | Default | Description |
|---|---|---|---|
| `PUBLIC_URL` | Yes, or set `FRONTEND_URL` | | Public address of the site, for example `https://f1.example.com` |
| `ADMIN_USERNAME` | Yes | `admin` in development | Admin login. Production refuses to start with `admin` |
| `ADMIN_PASSWORD` | Yes | `admin123` in development | Admin password, applied again on every start. Production refuses to start with `admin123` |
| `SERVER_PORT` / `PORT` | Yes, one of them | `3000` | Web port. `SERVER_PORT` wins when both are set |
| `DATA_DIR` | No | `./data` | Folder for databases, backups and generated tracks |

### Discord and weather

These are optional. The features that need them are unavailable until they are set.

| Variable | Default | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | | Application ID |
| `DISCORD_CLIENT_SECRET` | | OAuth2 client secret |
| `DISCORD_BOT_TOKEN` | | Bot token |
| `DISCORD_BOT_STATUS` | `online` | `online`, `idle`, `dnd` or `invisible` |
| `DISCORD_BOT_ACTIVITY_TYPE` | `WATCHING` | `PLAYING`, `STREAMING`, `LISTENING`, `WATCHING` or `COMPETING` |
| `DISCORD_BOT_ACTIVITY_TEXT` | `f1.markveber.hu` | Text shown on the bot's profile |
| `PUBLIC_APP_BUTTON_LABEL` | `Open F1 calendar` | Label of the website button on notifications |
| `METEOBLUE_API_KEY` | | Needed for weather forecasts |

### Advanced settings

You rarely need these. On Pelican they go in a `.env` file.

| Variable | Default | Description |
|---|---|---|
| `FRONTEND_URL` | `PUBLIC_URL` | Site address used for redirects and allowed origins |
| `PUBLIC_APP_URL` | `PUBLIC_URL` | Address used in Discord links and thumbnails |
| `DISCORD_REDIRECT_URI` | `<PUBLIC_URL>/api/discord/callback` | OAuth callback address |
| `CORS_ORIGIN` | `*` in production | Comma-separated allowed origins |
| `COOKIE_SECURE` | Automatic | Forces the `Secure` cookie flag on or off |
| `TRACK_DATA_DIR` | `<DATA_DIR>/tracks` | Where generated tracks are stored |
| `JOLPICA_BASE_URL` | `https://api.jolpi.ca/ergast/f1` | Season schedule source |
| `TRACK_GEOJSON_URL` | bacinger/f1-circuits on GitHub | Track geometry source |

## Deploy on Pelican Panel

The repository ships an egg in [`pelican/egg-f1calendar.json`](pelican/egg-f1calendar.json). It uses the `ghcr.io/pelican-eggs/yolks:nodejs_22` image and starts with `node startprod.js`.

### 1. Import the egg

In the admin area open **Eggs → Import**, then upload the file or paste its raw URL:

```text
https://raw.githubusercontent.com/MarkVebeer/F1-Calendar/main/pelican/egg-f1calendar.json
```

### 2. Create the server

1. Go to **Servers → Create** and choose the **F1 Calendar** egg.
2. Assign one port. The app listens on it automatically.
3. Allow at least 1 GB of RAM, because the installer builds the frontend.
4. Fill in `PUBLIC_URL`, `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Add the Discord and Meteoblue values if you want those features.
5. Create the server. When the installer has finished, press **Start**. The console prints `Server running on port` when the app is ready.

### 3. Add a domain

Put a reverse proxy with HTTPS in front of the port and use that address as `PUBLIC_URL`. See the [Caddy example](#reverse-proxy).

### Updating

Open the server in Pelican and use **Settings → Reinstall Server**, then start it again. The installer fetches the latest code from `GIT_BRANCH`, reinstalls dependencies and rebuilds the frontend. The `data` folder and `.env` are left alone, and any database migrations run on the next start.

Reinstalling does not update the egg itself. If a release adds a new panel variable, update the egg in the admin area first.

### Do I need a `.env` file?

No. The **Startup** tab covers everything needed to run. Create a `.env` in the server root only for the [advanced settings](#advanced-settings). If a variable is set in both places, the panel wins.

### Moving existing data

Stop the server and copy `f1calendar.db`, `f1calendar-admin.db` and `f1calendar-discord.db` into the `data` folder. They are upgraded automatically on the next start.

## Deploy on your own server

You need Node.js 22 or newer and enough memory to build the frontend (about 1 GB).

```bash
git clone https://github.com/MarkVebeer/F1-Calendar.git
cd F1-Calendar
cp .env.example .env    # then fill in real values
npm ci --omit=dev
npm run build
npm start
```

`npm start` runs [`startprod.js`](startprod.js), which checks the configuration and starts the server. It does not build anything. Use a process manager such as systemd or pm2 to keep it running.

To update:

```bash
git pull
npm ci --omit=dev
npm run build
```

Then restart the app. Migrations run on startup.

### Reverse proxy

The app expects exactly one reverse proxy in front of it and should be served over HTTPS. With [Caddy](https://caddyserver.com):

```text
f1.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Set up Discord

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. On the **General Information** page, copy the **Application ID** into `DISCORD_CLIENT_ID`.
3. On the **OAuth2** page, copy the **Client Secret** into `DISCORD_CLIENT_SECRET`.
4. On the same page, add this redirect, using your own address:
   ```text
   https://f1.example.com/api/discord/callback
   ```
5. On the **Bot** page, create a token and put it in `DISCORD_BOT_TOKEN`.
6. Restart the app, open `https://f1.example.com/#discord`, sign in, and use **Invite bot** to add it to a server.

The invite requests permission to view channels, send messages, manage messages, read message history, mention roles and use application commands.

Track thumbnails in notifications are loaded by Discord from your site, so they only appear when `PUBLIC_URL` is reachable from the internet over HTTPS.

## Set up weather forecasts

Create an API key at [meteoblue](https://www.meteoblue.com/en/weather-api) and set `METEOBLUE_API_KEY`. Forecasts are then enabled per server from the Discord dashboard.

## Using the app

### Calendar

The home page shows the current or next weekend at the top, followed by the list grouped by season. Select a card to see all of its sessions. The timezone is under **Settings**.

### Admin panel

Open `/#admin` on your site, for example `https://f1.example.com/#admin`. There is no link to it on the page.

| Section | Purpose |
|---|---|
| Site settings | How many finished weekends stay in the list before the next one (0 to 24, default 1) |
| Admin actions | Refresh the calendar now, or sign out |
| Create custom event | Add an event of your own to the calendar |
| Custom events | Review and delete your events |
| Change password | Change the password until the next restart |

`ADMIN_PASSWORD` is applied on every start, so make permanent changes there. Sessions last 12 hours and end when the app restarts.

### Discord dashboard

Open `/#discord` or use the **Discord dashboard** button. You can manage servers that you own or have the Administrator permission on.

| Section | Purpose |
|---|---|
| Notification settings | Channel, timezone and a role to mention for each session type |
| Notification timing | Reminders at any number of minutes before a session, each for selected session types. `0` means at the start |
| Weather notifications | Channel, optional role and on/off switch. Sends a forecast on the first day of a race weekend, plus a race-day forecast the chosen number of minutes before that day's first session |

## Track data and drawings

Drawings are built by the app and stored locally. The daily sync in [`server/tracks/trackSync.js`](server/tracks/trackSync.js) works like this:

1. It reads the season schedules from the [Jolpica F1 API](https://github.com/jolpica/jolpica-f1) to learn circuit names, cities and coordinates.
2. For each circuit it looks for a track line in this order:
   1. A manual file at `server/data/overrides/<circuitId>.geojson`.
   2. The [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) GeoJSON, within 1 km of the circuit.
   3. OpenStreetMap, for circuits in the current or next season, and only when the raceway data gives one unambiguous lap.
3. Each line must be closed, 2.5 to 9 km long, have at least 30 points and lie close to the circuit before it is used.
4. A placeholder is shown when no valid line exists, and a warning is logged. The lookup is retried on later syncs.

Calendar events are matched to circuits in [`server/tracks/matchEvent.js`](server/tracks/matchEvent.js). Published seasons match by race date. For seasons not published yet, the country and Grand Prix name are used until the schedule appears.

A starter set of circuits and drawings is committed in `server/data/seed/`, so a fresh install works immediately. Runtime results go to `<DATA_DIR>/tracks` and take priority over the seed. To rebuild the seed:

```bash
npm run tracks:build
```

To supply a track by hand, save a GeoJSON `LineString` (or a `FeatureCollection` containing one) as `server/data/overrides/<circuitId>.geojson`. Circuit ids are listed in `server/data/seed/circuits.json`.

## Data, backups and migrations

Everything that must survive an update lives in `DATA_DIR`:

```text
data/
├── f1calendar.db           races and custom events
├── f1calendar-admin.db     admin users and site settings
├── f1calendar-discord.db   Discord users, server settings and send logs
├── backups/                automatic backups taken before migrations
└── tracks/                 generated circuit list and drawings
```

The calendar feed only reaches back a few weeks. The app keeps finished races it has already seen, so a new install starts with a short history that grows over time.

### Migrations

Migrations run on startup and are tracked per database in a `schema_migrations` table. Each one runs in a transaction. If any are pending, a backup is written to `data/backups/` first, keeping the latest five per database. If a migration fails, the change is rolled back and the app refuses to start, with the reason in the log.

To change a schema, append a new entry with a new stable id to the `migrations` array in [`server/db.js`](server/db.js), [`server/discordDb.js`](server/discordDb.js) or [`server/adminDb.js`](server/adminDb.js). Never rename or edit a migration that has already shipped.

### Restoring a backup

1. Stop the app.
2. Copy the file from `data/backups/` over the matching database in `data/`. For example, `discord-<timestamp>.db` replaces `f1calendar-discord.db`.
3. Start the app.

## API overview

All routes are under `/api`. Admin routes need an admin session, and Discord routes need a Discord session. Sign-in routes are limited to 30 requests per 15 minutes in production.

| Method and path | Access | Purpose |
|---|---|---|
| `GET /races` | Public | All sessions and custom events |
| `GET /site-settings` | Public | Public list settings |
| `GET /tracks/<id>.svg`, `GET /tracks/<id>.png` | Public | Track drawing |
| `GET /tracks/meta` | Public | Track data attribution info |
| `POST /admin/login`, `POST /admin/logout`, `GET /admin/me` | Admin session | Admin sign-in and status |
| `POST /admin/change-password` | Admin | Change the password |
| `PUT /admin/site-settings` | Admin | Update list settings |
| `POST /admin/sync` | Admin | Refresh the calendar |
| `GET`, `POST /admin/custom-events`, `DELETE /admin/custom-events/:id` | Admin | Manage custom events |
| `GET /discord/login`, `GET /discord/callback`, `POST /discord/logout`, `GET /discord/me` | Discord session | Discord sign-in and status |
| `GET /discord/admin-guilds` | Discord | Servers you can manage |
| `GET /discord/guilds/:guildId/channels`, `GET /discord/guilds/:guildId/roles` | Discord | Channels and roles of a server |
| `GET /discord/config/:guildId`, `POST /discord/config` | Discord | Notification settings |
| `GET /discord/weather-config/:guildId`, `POST /discord/weather-config` | Discord | Weather settings |
| `GET /discord/notifications/:guildId`, `POST /discord/notifications`, `DELETE /discord/notifications/:id` | Discord | Reminder timings |

## Project layout

```text
client/                 React frontend (Vite)
  src/App.jsx           pages, admin panel and Discord dashboard
  src/weekends.js       weekend timeline and season grouping
pelican/                Pelican egg
scripts/                maintenance scripts
server/
  index.js              Express app and API routes
  env.js                configuration loading
  migrate.js            migration runner
  db.js                 races and custom events
  adminDb.js            admin users and site settings
  discordDb.js          Discord data
  icsParser.js          calendar sync
  scheduler.js          cron jobs
  discordWorker.js      session reminders
  discordService.js     Discord REST calls
  discordPresence.js    bot gateway connection
  weatherWorker.js      weather forecasts
  meteoblueService.js   meteoblue client
  tracks/               circuit list and drawing generation
  data/seed/            committed circuits and drawings
  data/overrides/       optional manual track lines
startprod.js            production entry point
```

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the backend and frontend with reload |
| `npm test` | Run the test suite |
| `npm run build` | Build the frontend into `client/dist` |
| `npm start` | Start in production mode |
| `npm run tracks:build` | Regenerate the committed track seed |

## Troubleshooting

| Problem | What to check |
|---|---|
| `Missing required environment variables` | Set the listed values. `PUBLIC_URL` covers `FRONTEND_URL` |
| `Refusing to start in production with default admin credentials` | Use a username other than `admin` and a password other than `admin123` |
| The site shows a blank page or a 404 in production | Run `npm run build`. On Pelican, reinstall the server and read the install log |
| `Track layout unavailable` on a card | No valid line exists for that circuit yet. Check the log, or add an [override](#track-data-and-drawings) |
| A weekend has no circuit name | The event could not be matched yet. A track sync is triggered automatically, at most every 6 hours |
| Discord says the redirect URI is invalid | The redirect in the Developer Portal must match `<PUBLIC_URL>/api/discord/callback` exactly |
| Notifications arrive without a track image | `PUBLIC_URL` must be reachable from the internet over HTTPS |
| A server is missing from the Discord dashboard | You must own it or have the Administrator permission, then invite the bot |
| The admin password changed back | `ADMIN_PASSWORD` is applied on every start. Update it there |
| A new panel variable is missing on Pelican | Update the egg in the admin area, then check the **Startup** tab |
| The app stops with `Migration ... failed` | Read the logged reason. The failed migration was rolled back, and a backup is in `data/backups/` |

## Credits and licences

- Season schedules from the [Jolpica F1 API](https://github.com/jolpica/jolpica-f1).
- Track geometry from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT licence, included at [`server/data/seed/f1-circuits.LICENSE.md`](server/data/seed/f1-circuits.LICENSE.md).
- Fallback track geometry from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, ODbL. The site shows this credit whenever such a track is in use.
- Weather data from [meteoblue](https://www.meteoblue.com).

This is an unofficial project and is not affiliated with Formula 1 or its companies. No licence has been chosen for this repository's own code yet.
