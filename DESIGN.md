---
name: F1 Calendar
description: The Formula 1 schedule at a glance, in your timezone, light or dark.
colors:
  racing-red: "#c8232f"
  racing-red-text-dark: "#ff5a5f"
  racing-red-text-light: "#c01f2c"
  on-accent: "#ffffff"
  pit-lane-black: "#0b0c0f"
  garage-graphite: "#16181d"
  raised-graphite: "#1e2128"
  grid-line: "#2a2e36"
  timing-white: "#ffffff"
  telemetry-grey: "#9aa1ab"
  quiet-grey: "#868d97"
  paddock-mist: "#f3f4f6"
  paper-white: "#ffffff"
  pit-wall-grey: "#eceef2"
  hairline: "#dfe2e7"
  timing-ink: "#111317"
  slate: "#565d68"
  quiet-slate: "#646b76"
  live-green-dark: "#4cc684"
  live-green-light: "#12763f"
  live-tint-dark: "rgba(76, 198, 132, 0.14)"
  live-tint-light: "rgba(18, 118, 63, 0.1)"
  amber-dark: "#f2b33d"
  amber-light: "#925400"
  amber-tint-dark: "rgba(242, 179, 61, 0.14)"
  amber-tint-light: "rgba(146, 84, 0, 0.1)"
  focus-blue-dark: "#7cb4ff"
  focus-blue-light: "#1f5fd1"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 1.35rem + 1.8vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 1.15rem + 1.6vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  wordmark:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  row-title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.3
  time:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    fontFeature: "tnum"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  meta:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    letterSpacing: "0.04em"
rounded:
  card: "16px"
  sheet-phone: "20px"
  inner: "10px"
  row-item: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  gutter-wide: "24px"
  card: "20px"
  card-wide: "28px"
  section: "36px"
  content-max: "1040px"
components:
  button-primary:
    backgroundColor: "{colors.racing-red}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.inner}"
    padding: "0 18px"
    height: "44px"
  button-primary-small:
    backgroundColor: "{colors.racing-red}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.inner}"
    padding: "0 12px"
    height: "36px"
  button-text:
    textColor: "{colors.telemetry-grey}"
    padding: "0 6px"
    height: "36px"
  icon-button:
    textColor: "{colors.telemetry-grey}"
    rounded: "{rounded.inner}"
    size: "44px"
  icon-button-hover:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.timing-white}"
  field:
    backgroundColor: "{colors.garage-graphite}"
    textColor: "{colors.timing-white}"
    rounded: "{rounded.inner}"
    padding: "0 6px 0 14px"
    height: "46px"
  chip-next:
    backgroundColor: "{colors.racing-red}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  chip-live:
    backgroundColor: "{colors.live-tint-dark}"
    textColor: "{colors.live-green-dark}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  chip-soon:
    backgroundColor: "{colors.amber-tint-dark}"
    textColor: "{colors.amber-dark}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  chip-tbc:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.telemetry-grey}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  tag:
    textColor: "{colors.telemetry-grey}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  timezone-chip:
    textColor: "{colors.telemetry-grey}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "32px"
  featured-card:
    backgroundColor: "{colors.garage-graphite}"
    textColor: "{colors.timing-white}"
    rounded: "{rounded.card}"
    padding: "20px 18px 18px"
  countdown-cell:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.timing-white}"
    typography: "{typography.display}"
    rounded: "{rounded.inner}"
    padding: "10px 4px 8px"
  season-row:
    backgroundColor: "{colors.garage-graphite}"
    textColor: "{colors.timing-white}"
    rounded: "{rounded.inner}"
    padding: "12px 12px 12px 10px"
    height: "72px"
  season-row-hover:
    backgroundColor: "{colors.raised-graphite}"
  session-row:
    textColor: "{colors.timing-white}"
    rounded: "{rounded.row-item}"
    padding: "0 8px"
    height: "44px"
  session-row-current:
    backgroundColor: "{colors.raised-graphite}"
  sheet:
    backgroundColor: "{colors.garage-graphite}"
    textColor: "{colors.timing-white}"
    rounded: "{rounded.card}"
    width: "min(600px, calc(100vw - 32px))"
  segmented-control:
    backgroundColor: "{colors.raised-graphite}"
    rounded: "{rounded.inner}"
    padding: "4px"
  segment-selected:
    backgroundColor: "{colors.garage-graphite}"
    textColor: "{colors.timing-white}"
    rounded: "{rounded.row-item}"
    height: "38px"
---

# Design System: F1 Calendar

## Overview

**Creative North Star: "The Paddock Standard"**

F1 Calendar looks the way a fan expects an F1 schedule product to look, and is built better than the ones they already use. It is the category standard, chosen on purpose and played straight: flat cards on a calm tinted ground, one racing-red accent of our own, big tabular numbers for the countdown, and the circuit drawing as the only illustration. There is no novelty world and no smuggled quirk. The ambition lives in the finish: even spacing, numbers that never jitter, 44px tap targets, short purposeful motion, and two themes that are equally considered.

The page answers one question first: what is next, and when, in my timezone. The featured card for the next weekend owns the top of the page (Grand Prix name, a status chip, a day/hour/minute countdown, the circuit drawing, and the weekend's sessions by day with weather). Everything else recedes: the season list is a compact dated list of rows, finished weekends stay in place and dim, and the weekend detail opens in a sheet (a centred modal on desktop, a bottom sheet on phones). Density is generous on the featured card and compact in the list.

Light and dark are equals. The page follows the system theme by default; a header switch sets a remembered manual choice (stored before first paint, so there is no flash), and settings offer System, Light and Dark. Each theme has its own tinted neutrals and its own accent-text and state shades tuned for contrast; neither is a filter over the other.

**Key Characteristics:**
- The category standard, executed carefully: familiar layout, no gimmicks.
- One focus per screen: the featured next-weekend card leads, the season list recedes.
- Tabular figures everywhere, so times and the countdown never jitter.
- The single-stroke circuit drawing is the only illustration, and the only thing that draws itself in.
- Flat tonal layering; a shadow appears only on the open sheet and the selected segment.
- First-class light and dark themes, system-driven with a remembered switch.
- Motion is short and purposeful, or absent; all of it stops under reduced motion.

## Colors

Tinted neutrals per theme, one racing red with a fill shade and a per-theme text shade, green and amber reserved for session state, and a blue used only for focus.

### Primary
- **Racing Red** (racing-red): the one accent fill, identical in both themes. It fills the Next status chip, primary buttons, the favicon tile, and the checked timezone radio; it also tints text selection. White text sits on it (on-accent). It is our own red, visibly distinct from Formula 1's #E10600.
- **Racing Red Text** (racing-red-text-dark in dark, racing-red-text-light in light): red as text, lifted in dark and deepened in light so it clears contrast on each ground. Used for the wordmark's second word ("Calendar"), the "Next" marker on the next session row, the month in each season row's date block, and the text caret.

### Neutral (dark theme, the default)
- **Pit Lane Black** (pit-lane-black): page background and theme-color.
- **Garage Graphite** (garage-graphite): cards, season rows, fields, the sheet.
- **Raised Graphite** (raised-graphite): the layer above a card: countdown cells, session codes, the current session row, hover fills, the segmented-control track.
- **Grid Line** (grid-line): hairline dividers, field and tag borders, the sheet grabber.
- **Timing White** (timing-white): primary text, countdown numbers, the circuit stroke.
- **Telemetry Grey** (telemetry-grey): secondary text: meta lines, labels, units, icons at rest.
- **Quiet Grey** (quiet-grey): tertiary text: placeholders, finished sessions and weekends, the row chevron.

### Neutral (light theme)
Each light token mirrors a dark role one-for-one with its own tinted value: **Paddock Mist** (paddock-mist) background, **Paper White** (paper-white) surface, **Pit Wall Grey** (pit-wall-grey) raised layer, **Hairline** (hairline) dividers, **Timing Ink** (timing-ink) primary text and circuit stroke, **Slate** (slate) secondary text, **Quiet Slate** (quiet-slate) tertiary text.

### State
- **Live Green** (live-green-dark / live-green-light, on live-tint-dark / live-tint-light): live now. The Live now chip, the Live tag and inline Live marker, and a live session's code block.
- **Starting Amber** (amber-dark / amber-light, on amber-tint-dark / amber-tint-light): starting soon. The Starting soon chip and the "In N min" marker.
- **Focus Blue** (focus-blue-dark / focus-blue-light): the 2px focus-visible outline only.

### Named Rules
**The One Red Fill Rule.** Racing Red fills one thing per view: the Next chip on the featured card, or the primary action of a panel. Red as text marks identity (the wordmark) and "what's next" (the next session, the date blocks), never decoration.

**The State Colour Rule.** Green means live now, amber means starting soon, and red is never a state colour. Finished sessions and weekends are shown by dimming to tertiary text, not by colour.

**The Twin Theme Rule.** Every colour token has a value for both themes. Accent text, state colours, focus and the sheet shadow are re-tuned for light, not reused.

## Typography

**Display Font:** the system UI stack (system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif)
**Body Font:** the same stack
**Label/Mono Font:** none in the calendar; only the footer's build hash uses ui-monospace.

**Character:** native, fast and familiar on every device, like the platform's own sports apps. Weight (500 to 800) and size carry the hierarchy; no decorative face and no imitation of Formula 1's proprietary typeface.

### Hierarchy
- **Display** (800, fluid 28 to 40px, 1.05, -0.02em): countdown numbers, zero-padded to two digits.
- **Headline** (800, fluid 24 to 36px, 1.12, -0.015em, balanced wrap): the Grand Prix name on the featured card.
- **Title** (800, 22px, 1.15, -0.01em): season headings ("2026 season") and sheet titles.
- **Wordmark** (800, 20px, line-height 1): "F1 Calendar" in the header, second word in Racing Red Text.
- **Row title** (650, 15px, 1.3): weekend names in the season list; 550 and secondary once finished.

Weekend names are never shown in the feed's all caps. An all-caps name is title-cased: sponsor and country initialisms stay uppercase (STC, AWS, MSC, DHL, UBS, BWT, HSBC, ADNOC, TAG, AT&T, USA, UAE, UK, F1, GP), and small connecting words stay lowercase after the first word (de, la, du, des, von, van, der, of, the and similar), so "MSC CRUISES GRANDE PRÊMIO DE SÃO PAULO" reads "MSC Cruises Grande Prêmio de São Paulo". A name that is not all caps, such as a custom event's, keeps the casing its admin typed.
- **Time** (700, 16px): session start times; 500 and tertiary once done.
- **Body** (400, 15px on phones, 16px from 720px, 1.5): session names (550), meta lines, settings copy.
- **Meta** (400, 13px): row meta, schedule notes, weather, footer.
- **Label** (700, 13px, 0.04em, uppercase): day headings in the schedule. Month labels in date blocks are three letters ("Sep") at 11px, 700, 0.06em, uppercase. Chips are 13px 700 in sentence case; countdown units are 12px 600 lowercase ("days", "hrs", "min").

### Named Rules
**The Tabular Time Rule.** The whole calendar and the sheet set `font-variant-numeric: tabular-nums`, so digits never shift while the countdown ticks and times line up in columns.

**The Sentence Case Rule.** Chips, tags, buttons and countdown units are sentence or lower case. Uppercase is reserved for the day headings and the month in date blocks.

## Layout

One centred column, max 1040px, with a 16px gutter on phones and 24px from 720px. Top to bottom: header (wordmark left; theme switch and settings icon buttons right), an optional timezone notice, a full-width search field, the featured card, then one section per season with a 22px title and a list of rows, then a footer above a hairline.

Spacing runs on 4px steps (4, 8, 12, 16, 20, 24) with a few deliberate larger gaps: 18px between featured-card blocks, 36px above each season, 40px above the footer. List rows sit 8px apart.

Responsive behaviour:
- **Up to 480px:** season rows drop the chevron and shrink the circuit thumbnail to 48px; the whole row is the link.
- **Up to 640px:** the sheet becomes a bottom sheet (full width, 20px top corners, a grabber bar, rises from the bottom edge).
- **From 720px:** 24px gutter, 16px body, 28px featured padding, and the season list becomes two equal columns whose paired rows share one height.
- **From 960px:** the featured card splits into intro and status on the left and the circuit drawing (260px tall) on the right, with the schedule spanning below. The whole schedule block (heading with the timezone chip, day dividers and rows) keeps one 720px measure, so name and time stay within one glance; inside it each day becomes a 200px heading column beside its session list.

## Elevation & Depth

Flat, tonal layering. Depth comes from surface steps (background, then card, then raised layer) and hairline dividers. The two shadows in the system are both responses to state: the open sheet floats over a dimmed backdrop, and the selected theme segment lifts slightly off its track.

### Shadow Vocabulary
- **Sheet** (`0 24px 64px rgba(0,0,0,0.5)` in dark, `0 24px 64px rgba(17,19,23,0.18)` in light): the open weekend or settings sheet only, over a backdrop of `rgba(4,5,7,0.62)` dark / `rgba(17,19,23,0.38)` light.
- **Selected segment** (`0 1px 3px rgba(0,0,0,0.18)`): the checked option in the theme segmented control.

### Named Rules
**The Flat-By-Default Rule.** Cards and rows sit flat on the ground. Lift is a response to state (an open sheet, a selected segment), never decoration, and never a glow.

## Shapes

Friendly, rounded geometry on two main radii. Large containers (the featured card, sheets, state panels) use generous 16px corners; the phone bottom sheet uses 20px top corners. Everything inside or below card scale (season rows, countdown cells, fields, buttons, icon buttons, the segmented track, the timezone list) uses 10px. Items inside those (session rows, segments, the search clear button) step down to 8px. Chips, tags and the timezone chip are full pills. Dividers are 1px hairlines; the season row's date block is separated by a vertical hairline.

The circuit drawing is a single rounded-join, round-cap stroke in the current text colour with no fill, fitted to a tight box with 6% padding so every circuit fills its frame the same way. Stroke width is a share of the drawing's longer side (2.2% on the featured card and sheet, 5% on 56px row thumbnails, so small drawings stay legible). A missing layout shows a dashed hairline box with plain text.

Icons are one stroke family: 24px grid, 1.75 stroke, round caps and joins, currentColor, drawn inline. Weather glyphs (clear, partly cloudy, cloud, fog, rain, storm, snow) belong to the same family.

## Components

### Buttons
- **Shape:** gently rounded (10px), 44px tall.
- **Primary:** Racing Red fill, white 650-weight text, 0 18px padding; a 36px small variant (0 12px, 14px text) sits inside notices.
- **Hover / Focus:** hover brightens the fill (`brightness(1.08)`, 150ms); focus-visible draws the 2px Focus Blue outline at 2px offset.
- **Text button:** secondary grey, underlined at 3px offset, 36px tall; the quiet alternative beside a primary ("Keep London").
- **Icon button:** 44px square, transparent, secondary grey icon at 20px; hover fills with the raised layer and turns the icon primary.

### Chips and Tags
- **Status chip** (pill, 3px 10px, 13px 700): Next (Racing Red fill, white text), Live now (green on green tint, with a pulsing dot), Starting soon (amber on amber tint), Times TBC (raised layer, secondary text). One chip leads the featured card's status line.
- **Tag** (pill, 1px 8px, 12px 600, hairline border, secondary text): Testing, Sprint, Times TBC, Finished (tertiary), and Live (green on tint, borderless, with dot) inside season rows.
- **Timezone chip** (pill, 32px tall with a 44px tap area, hairline border): shows the active timezone in the schedule head and opens settings.

### Cards / Containers
- **Featured card:** Garage Graphite, 16px corners, no border, no shadow; padding 20px 18px 18px on phones, 28px from 720px; blocks 18px apart.
- **Countdown cells:** up to three raised cells (max 120px each, 8px apart, 10px corners) holding a Display number over a lowercase unit. Days, hours and minutes while a day or more remains; hours, minutes and seconds inside the last day.
- **State panel:** card surface, 16px corners, 24px 20px padding, a 18px 700 heading, secondary copy and an optional primary button (errors, empty search, no upcoming weekends).
- **Notice:** card surface with a hairline border, 10px corners, 14px secondary text with a primary and a text button.

### Inputs / Fields
- **Style:** card surface, 1px hairline border, 10px corners, 46px tall, a leading search icon, 16px input text, tertiary placeholder.
- **Focus:** the border shifts to tertiary grey (150ms); the input itself draws no outline.
- **Clear:** a 36px icon button with 8px corners appears while there is a query.

### Navigation
- **Header:** wordmark left, two icon buttons right (sun or moon to switch theme, a sliders icon for settings). No nav bar; weekends deep-link by hash (`#/2026/losail`) and open the weekend sheet.

### Season Row (signature)
A whole-row link on the card surface, 10px corners, at least 72px tall: a date block (three-letter month in Racing Red Text, uppercase 11px; days at 15px 750) behind a vertical hairline, then the weekend name, a meta line (circuit and location) and tags, then a 56px circuit thumbnail in secondary grey and a chevron. Hover raises the fill. Finished rows stay in place and dim names, dates, meta and drawing to secondary and tertiary text.

### Weekend Schedule (signature)
A "Schedule" heading with the timezone chip, then one section per day: an uppercase day heading with that day's weather (glyph, high in primary 700, low and rain in secondary), and 44px session rows in three columns (a 58px code column, the session name with any Live / In N min / Next marker, and the time in 700). Only FP1, FP2, FP3 and SQ show a code block (raised fill, 6px corners, 12px 700); Qualifying, Race and Sprint leave the code column empty and unstyled. The session the countdown points at is marked by a 700-weight name and a "Next" label in Racing Red Text, with no fill. The session a deep link points at gets the raised row fill. Live sessions colour their code block green; date-only sessions read "TBC" in tertiary. On desktop the whole schedule keeps a 720px measure.

### Sheet
A native dialog on the card surface: centred, up to 600px wide and 88vh tall, 16px corners and the sheet shadow on desktop; full-width bottom sheet with 20px top corners and a grabber on phones. Head (title in Title type, meta lines, close icon button) above a hairline; scrolling body with contained overscroll. Opening moves focus to the title. The weekend sheet shows the circuit drawing (170px), the schedule and a footer link; the settings sheet holds Theme (segmented System / Light / Dark), Timezone (search field and a bordered radio list) and Discord reminders.

### Motion
Four motions, all on `transform`, `opacity` or a stroke offset, all off under `prefers-reduced-motion` (hover transitions included):
- **Circuit draw-in:** on the featured card only, a 16%-opacity copy of the circuit holds its place while the full line traces itself once (1400ms, ease-out, 120ms delay).
- **Sheet in / out:** 260ms ease-out in (rise 8px and settle from 0.985 scale); 170ms ease-in out. On phones it slides up from the bottom (300ms) and back down. The backdrop fades with it.
- **Live pulse:** the live dot breathes to 35% opacity on a 1.6s loop.
- **Hover:** 150ms colour and background transitions on rows, icon buttons, fields and buttons.
The countdown itself does not animate; its numbers simply change, and it is announced on demand, not every second.

## Do's and Don'ts

### Do:
- **Do** follow the system theme by default, offer a header switch and a System / Light / Dark setting, and apply the stored choice before first paint.
- **Do** define every colour for both themes and re-tune accent text, state colours, focus and shadows for light.
- **Do** keep the featured next-weekend card as the only focused card, with its status chip, countdown, circuit drawing and schedule.
- **Do** set every time, date and countdown in tabular figures, and show each session time with its weekday and timezone.
- **Do** use Racing Red (#c8232f) for fills and Racing Red Text for red words, never Formula 1's #E10600.
- **Do** keep tap targets at 44px (extend a compact control's hit area when needed) and show focus with the 2px Focus Blue outline.
- **Do** dim finished sessions and weekends in place rather than hiding or recolouring them.
- **Do** keep motion short and purposeful, on transform and opacity, and turn all of it off under `prefers-reduced-motion`.
- **Do** show weather only where it is real data, and label missing data plainly ("Times TBC", "Track layout unavailable").

### Don't:
- **Don't** imitate Formula 1's brand: no exact F1 red (#E10600), no F1 logo, no imitation of its proprietary typeface.
- **Don't** use red for state: live is green, soon is amber, done is dimmed.
- **Don't** add shadows to cards or rows, or any glow; depth is tonal.
- **Don't** use gamer or neon styling: no glowing edges or neon accents.
- **Don't** ship cheap animation: no bounces, no long fades, no decorative motion on every element, nothing that stutters on a phone.
- **Don't** put an eyebrow or kicker above headings; the Grand Prix name leads its card.
- **Don't** clutter the phone view: one focus, a clear list, and nothing that slows down the answer to "what is next and when".
