---
version: 1
slug: "client-src-dashboards-jsx"
primary_target: "client/src/Dashboards.jsx"
related_targets: ["client/src/dashboard.css","client/src/App.jsx"]
---

# Surface: Discord dashboard and admin panel

Mode: Operate, mostly desktop but fully usable on phones. Discord dashboard: a server owner or admin sets reminders up once, then tunes or checks them now and then. Admin panel: the self-hoster manages custom events, syncs and checks the calendar's health. World: DESIGN.md (The Paddock Standard), unchanged; denser than the calendar, forms and lists instead of a card mosaic.

Scope (approved shape brief, 2026-11-26): server list with bot status; a guided first setup (invite bot, channel, timings, test message; weather separately and optional); a server page in sections (Reminders, Weather, Check) with a live Discord-style message preview built by the bot's own embed code; clear unsaved-changes state. Admin: sign in, sync status (last sync time, result, refresh), custom events with confirmed delete, site setting, password change. Every current function and API behaviour stays; the public calendar is untouched.

Anti-goals: emoji headings, cards inside cards, side stripes, gradient text (the old App.css habits), one crowded wall of forms.

Ranges and states: 0 / 1–3 / 20+ servers; 100+ channels and roles; 0–6 timings per server; signed out, no permission, bot missing, saving / saved / failed, test message sending / sent / failed (e.g. no write access), Discord API not answering; admin: sync running / ok / failed, 0–30 custom events.

## Direction contract

THESIS: Settings screens that feel like the calendar's own back office: the same tokens, header, fields and sheets, arranged as calm sections with one primary action each. It refuses the stacked emoji-card wall of the old dashboards and any admin-template chrome.

OWN-WORLD: DESIGN.md tokens in both themes: tonal surfaces on the page ground, 10px inner radii on fields and rows, one racing-red fill for the primary action per section, green and amber only for state, system UI type with tabular figures, the existing SVG icon set. The message preview is the one place another visual language appears: a faithful Discord message card, framed as a preview.

STORY: A server admin signs in, picks a server, follows numbered steps to a working reminder, sees exactly what the bot will post, sends a test, then tunes timings and weather later from clearly separated sections. The self-hoster sees at once whether the calendar is synced and fixes what is not.

FIRST VIEWPORT: The shared header (wordmark back to the calendar, theme, account). Discord: a title with the signed-in user, the server list as rows with icon, name and a bot status chip and one action each. A server page: section navigation on the left (Reminders, Weather, Check) and the active section on the right with the preview beside the form on desktop, below on phones. Admin: a sync status bar at the top with Refresh now, then sections for custom events, site settings and password.

FORM: seed: none (pinned) "asztalon bal oldali szekció-navigáció és jobb oldalt a tartalom; telefonon egymás alatti szekciók" and "vezetett beállítás: lépések számozva, csak a következő lépés aktív"

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
