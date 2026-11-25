import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './calendar.css'
import BuildInfo from './BuildInfo'
import TrackDrawing from './TrackDrawing'
import { useTheme } from './theme'
import { buildWeekendTimeline, groupBySeason, isWeekendFinished, selectVisibleWeekends } from './weekends'
import { describeSession, isTimeTbc, weekendKey } from './sessions'
import { addDays, countdownParts, dateBlock, dayKey, formatDateRange, formatDay, formatTime, timeZoneCity, timeZoneLabel, titleCaseName } from './format'
import { ChevronIcon, CloseIcon, MoonIcon, SearchIcon, SettingsIcon, SunIcon, WeatherIcon, describeWeather } from './icons'

const DEFAULT_PAST_WEEKENDS_VISIBLE = 1
const SOON_MS = 60 * 60 * 1000
const DEFAULT_SESSION_MS = 2 * 60 * 60 * 1000
const FORECAST_LEAD_DAYS = 6
const TIMEZONE_KEY = 'f1-timezone'
const DEVICE_NOTICE_KEY = 'f1-timezone-notice-dismissed'

const ALL_TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
})()

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- data model ----------

function sessionEndMs(event) {
  return event.end_date ? new Date(event.end_date).getTime() : new Date(event.date).getTime() + DEFAULT_SESSION_MS
}

function sessionStatus(event, nowMs) {
  if (isTimeTbc(event)) return 'tbc'
  const start = new Date(event.date).getTime()
  if (nowMs >= sessionEndMs(event)) return 'done'
  if (nowMs >= start) return 'live'
  if (start - nowMs <= SOON_MS) return 'soon'
  return 'upcoming'
}

function groupIntoWeekends(races) {
  const grouped = {}
  for (const race of races) {
    const name = race.name.trim()
    const season = new Date(race.date).getUTCFullYear()
    const groupKey = `${season} ${name}`.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim()
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        name,
        season,
        location: race.location,
        city: race.city,
        circuit_name: race.circuit_name,
        circuit_id: race.circuit_id,
        timezone: race.timezone,
        events: []
      }
    }
    grouped[groupKey].events.push(race)
  }
  for (const grandPrix of Object.values(grouped)) {
    grandPrix.events.sort((a, b) => new Date(a.date) - new Date(b.date))
  }
  return grouped
}

// Timeline entries enriched with what every view needs: deep-link key, format and TBC state.
// No round numbers: the feed drops finished events, so a count of what is left would be wrong.
function buildWeekends(races) {
  const timeline = buildWeekendTimeline(groupIntoWeekends(races))
  return timeline.map((weekend) => {
    const { grandPrix } = weekend
    const isTesting = /testing/i.test(grandPrix.name)
    const isCustom = grandPrix.events.every((event) => event.source === 'custom')
    return {
      ...weekend,
      linkKey: weekendKey(grandPrix.season, grandPrix.circuit_id, grandPrix.name),
      // Only the feed's all-caps names are re-cased; a custom event keeps the name its admin typed.
      title: grandPrix.name === grandPrix.name.toUpperCase() ? titleCaseName(grandPrix.name) : grandPrix.name,
      isTesting,
      isCustom,
      isSprint: grandPrix.events.some((event) => event.type === 'sprint'),
      allTbc: grandPrix.events.every((event) => isTimeTbc(event)),
      endMs: Math.max(...grandPrix.events.map(sessionEndMs))
    }
  })
}

function featuredWeekend(weekends, nowMs) {
  return weekends.find((w) => nowMs >= w.startMs && nowMs < w.currentWindowEndMs)
    || weekends.find((w) => nowMs < w.startMs)
    || null
}

// The session the featured card counts towards: a running one first, then the next with a real time.
function focusSession(weekend, nowMs) {
  const events = weekend.grandPrix.events
  const live = events.find((event) => sessionStatus(event, nowMs) === 'live')
  if (live) return { event: live, status: 'live', targetMs: sessionEndMs(live) }
  const next = events.find((event) => ['soon', 'upcoming'].includes(sessionStatus(event, nowMs)))
  if (next) return { event: next, status: sessionStatus(next, nowMs), targetMs: new Date(next.date).getTime() }
  return null
}

function locationLine(grandPrix) {
  const place = [grandPrix.city, grandPrix.location].filter(Boolean)
  const unique = place.filter((value, index) => place.indexOf(value) === index)
  return [grandPrix.circuit_name, unique.join(', ')].filter(Boolean).join(' · ')
}

function groupByDay(events, timeZone) {
  const days = []
  for (const event of events) {
    const key = dayKey(event.date, timeZone)
    let day = days.find((d) => d.key === key)
    if (!day) {
      day = { key, label: formatDay(event.date, timeZone), events: [] }
      days.push(day)
    }
    day.events.push(event)
  }
  return days
}

function parseRoute(hash) {
  const match = String(hash).match(/^#\/(\d{4})\/([a-z0-9_-]+)(?:\/([a-z0-9]+))?$/i)
  return match ? { key: `${match[1]}/${match[2].toLowerCase()}`, session: match[3] ? match[3].toLowerCase() : null } : null
}

// ---------- small components ----------

function Countdown({ targetMs, onElapsed, label }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    setNowMs(Date.now())
    const timer = setInterval(() => {
      const current = Date.now()
      setNowMs(current)
      if (current >= targetMs) onElapsed?.()
    }, 1000)
    return () => clearInterval(timer)
  }, [targetMs, onElapsed])

  const { days, hours, minutes, seconds } = countdownParts(targetMs - nowMs)
  const cells = days > 0
    ? [[days, days === 1 ? 'day' : 'days'], [hours, 'hrs'], [minutes, 'min']]
    : [[hours, 'hrs'], [minutes, 'min'], [seconds, 'sec']]
  const spoken = cells.map(([value, unit]) => `${value} ${unit}`).join(' ')

  // role="timer" is not announced on every tick; the label gives the whole value on demand.
  return (
    <div className="countdown" role="timer" aria-label={`${label} ${spoken}`}>
      {cells.map(([value, unit]) => (
        <span className="countdown-cell" key={unit} aria-hidden="true">
          <span className="countdown-value">{String(value).padStart(2, '0')}</span>
          <span className="countdown-unit">{unit}</span>
        </span>
      ))}
    </div>
  )
}

function WeatherBadge({ day }) {
  if (!day) return null
  const { label } = describeWeather(day.pictocode)
  const rain = Number.isFinite(day.rainChance) && day.rainChance >= 20 ? `${day.rainChance}% rain` : null
  return (
    <span className="weather" title={label}>
      <WeatherIcon pictocode={day.pictocode} size={18} />
      <span className="weather-temp">{day.tempMax}°<span className="weather-low"> / {day.tempMin}°</span></span>
      {rain && <span className="weather-rain">{rain}</span>}
      <span className="sr-only">{label}</span>
    </span>
  )
}

function forecastNote(weekend, weather, nowMs, timeZone) {
  if (!weather?.enabled || weekend.allTbc || weekend.isCustom) return null
  if (weather.forecasts?.[weekend.linkKey]) return null
  if (weekend.endMs < nowMs) return null
  if (weekend.startMs - nowMs > (FORECAST_LEAD_DAYS + 1) * 86400000) {
    return `Weather forecast from ${formatDay(addDays(weekend.startMs, -FORECAST_LEAD_DAYS), timeZone)}`
  }
  return 'Weather forecast not available yet'
}

// Codes earn a label only where they say more than the name (FP2, SQ); "Race | Race" says nothing twice.
const CODED_SESSION = /^(FP\d|SQ)$/

function SessionRow({ event, nowMs, timeZone, highlighted, isNext }) {
  const session = describeSession(event)
  const status = sessionStatus(event, nowMs)
  const minutesToGo = Math.max(1, Math.round((new Date(event.date).getTime() - nowMs) / 60000))
  return (
    <li className={`session session--${status} ${isNext ? 'session--next' : ''}`} aria-current={highlighted ? 'true' : undefined}>
      <span className="session-code" aria-hidden={CODED_SESSION.test(session.code) ? undefined : 'true'}>
        {CODED_SESSION.test(session.code) ? session.code : ''}
      </span>
      <span className="session-name">
        {session.name}
        {status === 'live' && <span className="state state--live"><span className="live-dot" aria-hidden="true" />Live</span>}
        {status === 'soon' && <span className="state state--soon">In {minutesToGo} min</span>}
        {isNext && status === 'upcoming' && <span className="state state--next">Next</span>}
        {status === 'done' && <span className="sr-only"> (finished)</span>}
      </span>
      <span className="session-time">{status === 'tbc' ? 'TBC' : formatTime(event.date, timeZone)}</span>
    </li>
  )
}

function Schedule({ weekend, nowMs, timeZone, weather, highlight, headingLevel = 3, onOpenSettings }) {
  const days = groupByDay(weekend.grandPrix.events, timeZone)
  // The row the countdown points at carries its own mark, so the chip above is never the only one.
  const next = focusSession(weekend, nowMs)?.event
  const forecast = weather?.enabled ? weather.forecasts?.[weekend.linkKey] : null
  const circuitZone = weekend.grandPrix.timezone || timeZone
  const note = forecastNote(weekend, weather, nowMs, timeZone)
  const Heading = `h${headingLevel}`
  const DayHeading = `h${headingLevel + 1}`

  return (
    <div className="schedule">
      <div className="schedule-head">
        <Heading className="schedule-title">Schedule</Heading>
        <button type="button" className="tz-chip" onClick={onOpenSettings} aria-label={`Times in ${timeZoneCity(timeZone)} time (${timeZoneLabel(timeZone)}). Change timezone`}>
          {timeZoneLabel(timeZone)} · {timeZoneCity(timeZone)}
        </button>
      </div>
      {weekend.allTbc && <p className="schedule-note">Session times are not confirmed yet. Dates may still change.</p>}
      {note && <p className="schedule-note">{note}</p>}
      {days.map((day) => {
        const weatherDay = forecast?.days?.find((d) => d.date === dayKey(day.events[0].date, circuitZone))
        return (
          <section className="day" key={day.key} aria-label={day.label}>
            <div className="day-head">
              <DayHeading className="day-title">{day.label}</DayHeading>
              <WeatherBadge day={weatherDay} />
            </div>
            <ol className="sessions">
              {day.events.map((event) => (
                <SessionRow
                  key={event.id + (event.source || '')}
                  event={event}
                  nowMs={nowMs}
                  timeZone={timeZone}
                  highlighted={highlight && describeSession(event).slug === highlight}
                  isNext={next === event}
                />
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

// Native <dialog>: focus moves in and stays in, Esc and the backdrop close it, focus returns to the opener.
function Sheet({ open, onClose, labelledBy, className = '', children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return undefined
    if (open && !dialog.open) {
      dialog.classList.remove('is-closing')
      dialog.showModal()
      dialog.querySelector('[data-autofocus]')?.focus()
      return undefined
    }
    if (!open && dialog.open) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) {
        dialog.close()
        return undefined
      }
      dialog.classList.add('is-closing')
      const timer = setTimeout(() => {
        dialog.close()
        dialog.classList.remove('is-closing')
      }, 170)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      {children}
    </dialog>
  )
}

function WeekendSheet({ weekend, highlight, nowMs, timeZone, weather, onClose, onOpenSettings }) {
  const { grandPrix } = weekend
  return (
    <div className="sheet-inner">
      <div className="sheet-head">
        <div>
          <h2 id="weekend-sheet-title" className="sheet-title" tabIndex={-1} data-autofocus>{weekend.title}</h2>
          <p className="meta">{[formatDateRange(weekend.startMs, weekend.endMs, timeZone), weekend.isTesting ? 'Testing' : null, weekend.isSprint ? 'Sprint weekend' : null].filter(Boolean).join(' · ')}</p>
          <p className="meta">{locationLine(grandPrix)}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-body">
        {!weekend.isCustom && <TrackDrawing circuitId={grandPrix.circuit_id} name={weekend.title} className="sheet-track" />}
        <Schedule weekend={weekend} nowMs={nowMs} timeZone={timeZone} weather={weather} highlight={highlight} headingLevel={3} onOpenSettings={onOpenSettings} />
        <p className="sheet-foot">
          Want reminders before each session? <a href="#discord">Set them up for your Discord server</a>.
        </p>
      </div>
    </div>
  )
}

function SettingsSheet({ theme, onThemeChange, timeZone, onTimeZoneChange, onClose }) {
  const [query, setQuery] = useState('')
  const device = deviceTimeZone()
  const normalized = normalizeSearch(query).replace(/\s+/g, '_')
  const matches = useMemo(() => {
    const pool = ALL_TIMEZONES.filter((zone) => !normalized || zone.toLowerCase().includes(normalized))
    const pinned = [device, 'UTC'].filter((zone, index, list) => list.indexOf(zone) === index && (!normalized || zone.toLowerCase().includes(normalized)))
    return [...pinned, ...pool.filter((zone) => !pinned.includes(zone))].slice(0, 80)
  }, [normalized, device])

  return (
    <div className="sheet-inner">
      <div className="sheet-head">
        <h2 id="settings-title" className="sheet-title" tabIndex={-1} data-autofocus>Settings</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-body">
        <fieldset className="setting">
          <legend className="setting-title">Theme</legend>
          <div className="segmented">
            {[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => (
              <label key={value} className="segment">
                <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => onThemeChange(value)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="setting">
          <legend className="setting-title">Timezone</legend>
          <p className="setting-hint">Session times are shown in {timeZoneCity(timeZone)} time ({timeZoneLabel(timeZone)}).</p>
          <label className="field">
            <span className="sr-only">Search timezones</span>
            <SearchIcon size={18} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a city or region" autoComplete="off" />
          </label>
          <div className="zone-list" role="radiogroup" aria-label="Timezone">
            {matches.length === 0 && <p className="setting-hint">No timezone matches “{query}”. Try a city such as Budapest or London.</p>}
            {matches.map((zone) => (
              <label key={zone} className="zone">
                <input type="radio" name="timezone" value={zone} checked={zone === timeZone} onChange={() => onTimeZoneChange(zone)} />
                <span className="zone-name">{zone.replace(/_/g, ' ')}{zone === device ? ' (this device)' : ''}</span>
                <span className="zone-label">{timeZoneLabel(zone)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="setting" aria-labelledby="discord-setting-title">
          <h3 id="discord-setting-title" className="setting-title">Discord reminders</h3>
          <p className="setting-hint">Server admins can post session reminders and weather to their own Discord server.</p>
          <a className="button" href="#discord">Open the Discord dashboard</a>
        </section>
      </div>
    </div>
  )
}

// ---------- page ----------

export default function Calendar() {
  const { preference, resolved, setPreference } = useTheme()
  const [races, setRaces] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [weather, setWeather] = useState(null)
  const [pastWeekendsVisible, setPastWeekendsVisible] = useState(DEFAULT_PAST_WEEKENDS_VISIBLE)
  const [showOsmCredit, setShowOsmCredit] = useState(false)
  const [query, setQuery] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [timeZone, setTimeZone] = useState(() => readStored(TIMEZONE_KEY, deviceTimeZone()))
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DEVICE_NOTICE_KEY) === '1'
    } catch {
      return false
    }
  })
  const landedOnWeekendRef = useRef(Boolean(parseRoute(window.location.hash)))
  const lastWeekendRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('cal-body')
    return () => document.body.classList.remove('cal-body')
  }, [])

  const loadRaces = useCallback(() => {
    setLoadError(false)
    fetch('/api/races')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(setRaces)
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    loadRaces()
    fetch('/api/weather').then((r) => (r.ok ? r.json() : null)).then(setWeather).catch(() => setWeather(null))
    fetch('/api/site-settings').then((r) => r.json()).then((s) => setPastWeekendsVisible(s.pastWeekendsVisible)).catch(() => {})
    fetch('/api/tracks/meta').then((r) => r.json()).then((m) => setShowOsmCredit(Boolean(m?.osmUsed))).catch(() => {})
  }, [loadRaces])

  // Statuses (live, soon, finished) need a clock, but only the countdown needs it every second.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const refreshNow = useCallback(() => setNowMs(Date.now()), [])

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const changeTimeZone = (zone) => {
    setTimeZone(zone)
    try {
      localStorage.setItem(TIMEZONE_KEY, zone)
    } catch {
      // the choice then lasts for this visit only
    }
  }

  const weekends = useMemo(() => (races ? buildWeekends(races) : []), [races])
  const featured = useMemo(() => featuredWeekend(weekends, nowMs), [weekends, nowMs])
  const focus = featured ? focusSession(featured, nowMs) : null
  const searchTokens = normalizeSearch(query).split(' ').filter(Boolean)
  const searching = searchTokens.length > 0

  const listed = useMemo(() => {
    if (searching) {
      return weekends.filter(({ grandPrix }) => {
        const text = normalizeSearch([grandPrix.name, grandPrix.location, grandPrix.city, grandPrix.circuit_name].join(' '))
        return searchTokens.every((token) => text.includes(token))
      })
    }
    return selectVisibleWeekends(weekends, nowMs, pastWeekendsVisible).filter((w) => w.key !== featured?.key)
    // searchTokens is derived from query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekends, nowMs, pastWeekendsVisible, featured, query])

  const routeWeekend = route ? weekends.find((w) => w.linkKey === route.key) : null
  if (routeWeekend) lastWeekendRef.current = routeWeekend
  const sheetWeekend = routeWeekend || lastWeekendRef.current

  // A link to a weekend that is not in the calendar falls back to the page itself.
  useEffect(() => {
    if (route && races && !routeWeekend) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setRoute(null)
    }
  }, [route, races, routeWeekend])

  const closeWeekend = () => {
    if (landedOnWeekendRef.current) {
      // Opened straight from a link (e.g. Discord): stay on the site instead of going back out of it.
      landedOnWeekendRef.current = false
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setRoute(null)
    } else {
      window.history.back()
    }
  }

  const device = deviceTimeZone()
  const showDeviceNotice = !noticeDismissed && timeZone !== device
  const dismissNotice = () => {
    setNoticeDismissed(true)
    try {
      sessionStorage.setItem(DEVICE_NOTICE_KEY, '1')
    } catch {
      // nothing to persist
    }
  }

  // Only what is still ahead can be counted honestly: the feed drops finished events.
  const upcomingCount = weekends.filter((w) => !w.isTesting && !w.isCustom && !isWeekendFinished(w, nowMs)).length

  return (
    <div className="cal">
      <a className="skip-link" href="#calendar-main">Skip to calendar</a>
      <header className="cal-header">
        <h1 className="wordmark">F1 <span>Calendar</span></h1>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <SettingsIcon />
          </button>
        </div>
      </header>

      {showDeviceNotice && (
        <div className="notice" role="status">
          <p>
            Times are shown in <strong>{timeZoneCity(timeZone)}</strong> time. This device is set to {timeZoneCity(device)}.
          </p>
          <div className="notice-actions">
            <button type="button" className="button button--small" onClick={() => changeTimeZone(device)}>Use {timeZoneCity(device)} time</button>
            <button type="button" className="text-button" onClick={dismissNotice}>Keep {timeZoneCity(timeZone)}</button>
          </div>
        </div>
      )}

      <div className="search" role="search">
        <label className="field field--search">
          <span className="sr-only">Search Grand Prix, country, city or circuit</span>
          <SearchIcon size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Grand Prix, country or circuit"
            autoComplete="off"
          />
          {query && (
            <button type="button" className="field-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <CloseIcon size={18} />
            </button>
          )}
        </label>
      </div>

      <main id="calendar-main" className="cal-main" aria-busy={!races && !loadError}>
        {loadError && (
          <div className="state-panel" role="alert">
            <h2>The calendar could not load</h2>
            <p>The server did not answer. Check your connection and try again.</p>
            <button type="button" className="button" onClick={loadRaces}>Try again</button>
          </div>
        )}

        {!races && !loadError && (
          <div className="skeleton" aria-hidden="true">
            <div className="skeleton-card" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <span className="sr-only">Loading the calendar</span>
          </div>
        )}

        {races && !searching && featured && (
          <section className="featured" aria-labelledby="featured-title">
            <div className="featured-intro">
              <h2 id="featured-title" className="featured-title">
                <a href={`#/${featured.linkKey}`}>{featured.title}</a>
              </h2>
              <p className="meta">{[formatDateRange(featured.startMs, featured.endMs, timeZone), featured.isTesting ? 'Testing' : null, featured.isSprint ? 'Sprint weekend' : null].filter(Boolean).join(' · ')}</p>
              <p className="meta">{locationLine(featured.grandPrix)}</p>
            </div>

            <div className="featured-status">
              {focus ? (
                <>
                  <p className="status-line">
                    <span className={`chip chip--${focus.status}`}>
                      {focus.status === 'live' && <span className="live-dot" aria-hidden="true" />}
                      {focus.status === 'live' ? 'Live now' : focus.status === 'soon' ? 'Starting soon' : 'Next'}
                    </span>
                    <span className="status-session">
                      {describeSession(focus.event).name}
                      <span className="status-when">
                        {' '}{focus.status === 'live' ? 'ends in' : `· ${formatDay(focus.event.date, timeZone)} ${formatTime(focus.event.date, timeZone)} ${timeZoneLabel(timeZone, focus.event.date)}`}
                      </span>
                    </span>
                  </p>
                  <Countdown
                    targetMs={focus.targetMs}
                    onElapsed={refreshNow}
                    label={focus.status === 'live' ? `${describeSession(focus.event).name} ends in` : `${describeSession(focus.event).name} starts in`}
                  />
                </>
              ) : (
                <p className="status-line">
                  <span className="chip chip--tbc">Times TBC</span>
                  <span className="status-session">Session times for this weekend are not confirmed yet.</span>
                </p>
              )}
            </div>

            {!featured.isCustom && (
              <a className="featured-track-link" href={`#/${featured.linkKey}`} tabIndex={-1} aria-hidden="true">
                <TrackDrawing circuitId={featured.grandPrix.circuit_id} name={featured.title} className="featured-track" drawIn />
              </a>
            )}

            <Schedule weekend={featured} nowMs={nowMs} timeZone={timeZone} weather={weather} headingLevel={3} onOpenSettings={() => setSettingsOpen(true)} />
          </section>
        )}

        {races && searching && listed.length === 0 && (
          <div className="state-panel">
            <h2>No Grand Prix matches “{query.trim()}”</h2>
            <p>Try a country, a city or a circuit, for example Monza or Japan.</p>
            <button type="button" className="button" onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}

        {races && !searching && weekends.length === 0 && !loadError && (
          <div className="state-panel">
            <h2>No races yet</h2>
            <p>The calendar has not synced any sessions yet. It refreshes every hour.</p>
          </div>
        )}

        {races && groupBySeason(listed).map(({ season, weekends: seasonWeekends }) => {
          // When a whole season is unconfirmed, say it once instead of on every row.
          const seasonTbc = seasonWeekends.every((weekend) => weekend.allTbc)
          return (
          <section className="season" key={season} aria-labelledby={`season-${season}`}>
            <h2 className="season-title" id={`season-${season}`}>{searching ? `${season} results` : `${season} season`}</h2>
            {seasonTbc && <p className="season-note">Session times for {season} are not confirmed yet. Dates may still change.</p>}
            <ol className="season-list">
              {seasonWeekends.map((weekend) => {
                const finished = isWeekendFinished(weekend, nowMs)
                const live = weekend.grandPrix.events.some((event) => sessionStatus(event, nowMs) === 'live')
                const block = dateBlock(weekend.startMs, weekend.endMs, timeZone)
                const range = formatDateRange(weekend.startMs, weekend.endMs, timeZone)
                const place = [weekend.grandPrix.city !== weekend.grandPrix.location ? weekend.grandPrix.city : null, weekend.grandPrix.location].filter(Boolean).join(', ')
                return (
                  <li key={weekend.key}>
                    <a className={`row ${finished ? 'row--finished' : ''}`} href={`#/${weekend.linkKey}`}>
                      <span className="row-date" aria-hidden="true">
                        <span className="row-month">{block.month}</span>
                        <span className="row-days">{block.days}</span>
                      </span>
                      <span className="row-body">
                        <h3 className="row-name">{weekend.title}</h3>
                        <span className="row-meta">
                          <span className="sr-only">{range} · </span>
                          {place || (weekend.isCustom ? 'Custom event' : '')}
                        </span>
                        <span className="row-tags">
                          {live && <span className="tag tag--live"><span className="live-dot" aria-hidden="true" />Live</span>}
                          {weekend.isTesting && <span className="tag">Testing</span>}
                          {weekend.isSprint && <span className="tag">Sprint</span>}
                          {weekend.allTbc && !seasonTbc && <span className="tag">Times TBC</span>}
                          {finished && <span className="tag tag--muted">Finished</span>}
                        </span>
                      </span>
                      {!weekend.isCustom && (
                        <TrackDrawing circuitId={weekend.grandPrix.circuit_id} name={weekend.title} className="row-track" strokeRatio={0.05} />
                      )}
                      <ChevronIcon className="row-chevron" size={18} />
                    </a>
                  </li>
                )
              })}
            </ol>
          </section>
          )
        })}
      </main>

      <footer className="cal-footer">
        {races && upcomingCount > 0 && <p>{upcomingCount} upcoming Grand Prix in the calendar</p>}
        <p><a href="#discord">Session reminders on Discord</a></p>
        {showOsmCredit && <p>Track data © OpenStreetMap contributors</p>}
        <BuildInfo timeZone={timeZone} />
      </footer>

      <Sheet open={Boolean(routeWeekend)} onClose={closeWeekend} labelledBy="weekend-sheet-title" className="sheet--weekend">
        {sheetWeekend && (
          <WeekendSheet
            weekend={sheetWeekend}
            highlight={route?.session}
            nowMs={nowMs}
            timeZone={timeZone}
            weather={weather}
            onClose={closeWeekend}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} labelledBy="settings-title" className="sheet--settings">
        {settingsOpen && (
          <SettingsSheet
            theme={preference}
            onThemeChange={setPreference}
            timeZone={timeZone}
            onTimeZoneChange={changeTimeZone}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </Sheet>
    </div>
  )
}
