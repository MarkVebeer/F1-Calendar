---
version: 1
slug: "client-src-app-jsx"
primary_target: "client/src/App.jsx"
related_targets: ["client/src/App.css","client/src/Calendar.jsx","client/src/calendar.css"]
---

# Surface: public calendar (main page) and weekend sheet

Mode: Operate. A visitor, usually on a phone and often arriving from a Discord reminder, wants to know what the next session is and when it starts in their timezone. Proof and content: the real F1 calendar feed, the circuit drawings and the weekend weather. Constraints: everything in PRODUCT.md.

Scope of this round (approved shape brief, 2026-11-25): the public calendar page and the weekend sheet (modal on desktop, bottom sheet on phones), with on-site weather, Discord deep links (#/<season>/<circuit-id>, e.g. #/2026/losail) and a live state. The admin and Discord dashboards follow in the next round; add-to-calendar is out of scope.

Must fix from the 2026-11-25 critique and audit: times with weekday and timezone and FP1/FP2/FP3/SQ naming; "Time TBC" for date-only feed sessions (the whole 2027 season); a compact dated list with the next weekend shown once; dialog focus management, contrast-safe finished state, lang="en", associated labels, heading order, main landmark, reduced motion, a countdown that does not re-render the page or announce every second.

Memorable moment: opening the page and reading the next session and its countdown at once, with the circuit drawing beside it.

Unresolved for the builder to settle with measured contrast: light theme neutrals and our own racing red (not F1's #E10600).

## Direction contract

THESIS: The category standard played straight: the F1 schedule product fans already know, built at the finish level of Apple Sports and the official F1 app. It refuses novelty worlds; it also refuses the sloppy version of the standard (uneven spacing, jittering numbers, cheap motion).

OWN-WORLD: Calm tinted neutrals in a dark theme (#0b0c0f ground, #16181d cards) and an equal light theme, one racing-red accent of our own, green and amber for live and soon. System UI type, tabular figures, 16px card corners, flat tonal layers, a white or dark single-stroke circuit drawing.

STORY: The visitor sees what is next and how long until it starts, scans the weekend's sessions in their own timezone, checks the weather, then searches or scrolls the season if they want more.

FIRST VIEWPORT: Header with the wordmark (second word in the accent), a theme switch and a settings button; a search field; the featured card with the Grand Prix name, the circuit, a status chip (Next, Live now) beside a countdown in day, hour and minute cells, the circuit drawing, and the weekend's session rows with weekday, time and timezone. No eyebrow above the heading. The season list starts below.

FORM: canon (the standing exit, chosen in the direction round); seed:7cf853dbcf397fc6

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
