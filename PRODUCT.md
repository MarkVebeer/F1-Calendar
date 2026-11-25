# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The owner's Discord community (primary).** Hungarian friends and server members who arrive from a Discord reminder or the site link and want to know when the next session starts.
- **Any F1 fan.** The site is public. Visitors check a race weekend's schedule in their own timezone, with no account.
- **Self-hosters.** People who deploy the open-source project (MIT) on their own server or Pelican panel, under their own domain.

The audience is Hungarian, but the interface stays in English: F1 terminology reads naturally in English. Hungarian appears where the owner configures it, for example the Discord website button label ("F1 oldal") and the page `lang`.

## Product Purpose

F1 Calendar follows the official F1 calendar feed and shows every race weekend with its sessions, a live countdown to the next one, and a drawing of the circuit. The same app posts session reminders and weather forecasts to Discord servers. Success: a fan can see what is next and when in their own timezone at a glance, and a Discord community is reminded in time without anyone posting it by hand.

## Positioning

Unlike the official F1 app or a Google Calendar import, it meets the community where it already is and stays in its owner's hands:

- Session reminders and role pings arrive in your own Discord server, with several reminders per server, filtered by session type.
- A fast, clean overview: the next weekend with a countdown, in your timezone, with no ads and no app to install.
- Every weekend shows its own circuit drawing, plus weekend and race-day weather forecasts.
- Fully self-hosted: your own domain, your own custom events (a watch party, for example), and one process with no external service to depend on at request time.

## Operating Context

- Visitors usually open the site from a Discord reminder or a shared link, often on a phone, close to the start of a session.
- Discord server admins sign in with Discord and set up channels, reminder lead times, role mentions per session type and the weather channel on the Discord dashboard.
- The site owner uses the admin panel to add custom events, force a calendar refresh, and choose how many finished weekends stay listed.
- The project runs as a single Bun process with SQLite. On Pelican it deploys every push to `main` automatically without downtime and reports build status to GitHub. The site footer shows the build number and commit.

## Capabilities and Constraints

- **Calendar:** practice, qualifying, sprint and race sessions synced hourly from the official F1 calendar feed, grouped into race weekends and seasons, with the current or next weekend highlighted with a countdown. Finished weekends appear dimmed. Search covers Grand Prix, country, city and circuit. Each visitor's timezone is remembered in their browser.
- **Tracks:** every circuit is drawn as its own SVG and PNG, generated from bacinger/f1-circuits GeoJSON, Jolpica and OpenStreetMap, and served from the app. If a source fails, the last good copy stays.
- **Discord:** OAuth sign-in, per-server configuration, several reminders per server, role mentions per session type, and weekend and race-day weather via Meteoblue.
- **Admin:** custom events, a forced sync, site settings, and an admin password synced from the panel.
- **Planned:** the weekend and race-day weather forecasts will also appear on the site, not only in Discord.
- **Constraints:** requests are served only from local data. External sources are used by background jobs only. Database migrations must be additive (expand-only), because two releases share the database during a deploy. Nothing in the project claims to be official or affiliated with Formula 1, and future work must not imply it.
- **Terminology:** Grand Prix, race weekend, session (practice, qualifying, sprint, race), custom event, season.

## Brand Commitments

- Name: **F1 Calendar**. Public instance: `f1.markveber.hu`.
- Interface copy is in English. Hungarian is limited to owner-configured strings.
- **The category standard, played straight** (chosen in the 2026-11 redesign round): the familiar look of an F1 schedule product, clean and simple, executed at full craft, without novelty worlds or quirks.
- **Light and dark themes are both first-class.** The site follows the visitor's system setting by default and offers a manual switch that is remembered.
- **Quality bar:** the craft level of the official F1 app and F1 TV, Apple Sports, Discord, and Linear or Vercel. These set the finish level, not a look to copy.
- **Motion must be good or absent:** purposeful, smooth animation on every device. Cheap or low-effort animation is worse than none, and nothing may make the site slow or cluttered on a phone.
- No other voice or logo commitments are confirmed yet.

## Evidence on Hand

- Circuit drawings: `server/data/seed/tracks/*.svg` and `*.png`, with the circuit list in `server/data/seed/circuits.json`.
- Credits and licences: OpenStreetMap attribution (shown in the footer when relevant), `server/data/seed/f1-circuits.LICENSE.md`, and the project `LICENSE` (MIT).
- Live data: the real F1 calendar, synced hourly (around 147 events in the current feed).
- No testimonials, user counts, server counts or press exist. Future work must not invent them.

## Product Principles

1. **The next session first.** The most important answer on any visit is what is next and when, in my timezone.
2. **Meet the community where it is.** Discord is a first-class channel, not an add-on to the website.
3. **Never break on someone else's outage.** External data only refreshes local copies; the site and the reminders keep working on the last good data.
4. **Owned, not rented.** Everything runs on the owner's server and domain, can be self-hosted by anyone, and deploys without downtime.
5. **Honest data.** Show what the feed and the sources actually say. Missing track or weather data is labelled, never faked.
