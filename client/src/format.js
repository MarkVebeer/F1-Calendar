// Date, time and name formatting in the visitor's chosen timezone.

const DAY_MS = 24 * 60 * 60 * 1000

function safeTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

const formatters = new Map()
function formatter(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat('en-GB', { timeZone: safeTimeZone(timeZone), ...options }))
  }
  return formatters.get(key)
}

// "Fri 27 Nov", assembled from parts because engines disagree on the comma after the weekday.
export function formatDay(date, timeZone) {
  const parts = Object.fromEntries(
    formatter(timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(date)).map((p) => [p.type, p.value])
  )
  return `${parts.weekday} ${parts.day} ${parts.month}`
}

// "14:30"
export function formatTime(date, timeZone) {
  return formatter(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))
}

// "2026-11-27": the calendar day in that timezone, for grouping.
export function dayKey(date, timeZone) {
  const parts = Object.fromEntries(
    formatter(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date)).map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

// The zone's offset from UTC at that moment, in ms (Budapest in winter: +3600000).
function zoneOffsetMs(ms, timeZone) {
  const parts = Object.fromEntries(
    formatter(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, Number(p.value)])
  )
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

// A wall-clock time typed for a zone ("2027-03-14T15:00", e.g. from <input type="datetime-local">) as a Date.
// The offset is looked up at the result again so a time near a DST change lands on the right side of it.
export function zonedTimeToDate(localValue, timeZone) {
  const match = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return new Date(NaN)
  const [, y, mo, d, h, mi] = match.map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const zone = safeTimeZone(timeZone)
  const first = wall - zoneOffsetMs(wall, zone)
  return new Date(wall - zoneOffsetMs(first, zone))
}

// Whole-day entries (sessions without a time yet) are stored as midnight UTC of their date. They name a date,
// not a moment, so every timezone shows that same date: this returns noon of that date in the chosen zone,
// which every day-based formatter here then reads as that date.
export function allDayInZone(date, timeZone) {
  const [y, m, d] = dayKey(date, 'UTC').split('-').map(Number)
  const noonUtc = Date.UTC(y, m - 1, d, 12)
  return new Date(noonUtc - zoneOffsetMs(noonUtc, safeTimeZone(timeZone)))
}

function shortZoneName(locale, timeZone, date) {
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone: safeTimeZone(timeZone), timeZoneName: 'short' })
      .formatToParts(new Date(date))
      .find((p) => p.type === 'timeZoneName')
    return part ? part.value : null
  } catch {
    return null
  }
}

// "CET" or "EST": British English knows the European names, US English the American ones;
// whichever gives letters instead of "GMT-5" wins, and "GMT+3" remains where no name exists.
export function timeZoneLabel(timeZone, date = new Date()) {
  const names = ['en-GB', 'en-US'].map((locale) => shortZoneName(locale, timeZone, date)).filter(Boolean)
  return names.find((name) => !/^(GMT|UTC)[+-]/.test(name)) || names[0] || timeZone
}

// "Europe/Budapest" -> "Budapest"
export function timeZoneCity(timeZone) {
  const last = String(timeZone).split('/').pop() || timeZone
  return last.replace(/_/g, ' ')
}

// "27–29 Nov" or "30 Nov – 1 Dec"
export function formatDateRange(start, end, timeZone) {
  const day = formatter(timeZone, { day: 'numeric' })
  const month = formatter(timeZone, { month: 'short' })
  const s = new Date(start)
  const e = new Date(end)
  if (dayKey(s, timeZone) === dayKey(e, timeZone)) {
    return `${day.format(s)} ${month.format(s)}`
  }
  if (month.format(s) === month.format(e)) {
    return `${day.format(s)}–${day.format(e)} ${month.format(e)}`
  }
  return `${day.format(s)} ${month.format(s)} – ${day.format(e)} ${month.format(e)}`
}

// A calendar-style block: { month: 'Nov', days: '20–22' }, or 'Apr–May' / '30–3' across a month end.
// Months are cut to three letters so the column stays even (British English writes "Sept").
export function dateBlock(start, end, timeZone) {
  const day = formatter(timeZone, { day: 'numeric' })
  const monthFormat = formatter(timeZone, { month: 'short' })
  const month = { format: (date) => monthFormat.format(date).slice(0, 3) }
  const s = new Date(start)
  const e = new Date(end)
  const sameDay = dayKey(s, timeZone) === dayKey(e, timeZone)
  const sameMonth = month.format(s) === month.format(e)
  return {
    month: sameMonth ? month.format(s) : `${month.format(s)}–${month.format(e)}`,
    days: sameDay ? day.format(s) : `${day.format(s)}–${day.format(e)}`
  }
}

export function countdownParts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  }
}

const SMALL_WORDS = new Set(['de', 'la', 'del', 'di', 'da', 'do', 'dos', 'das', 'du', 'des', 'von', 'van', 'der', 'of', 'the', 'and', 'e', 'y', 'el', 'le'])
// Sponsor and country initialisms that the feed writes in capitals and that stay that way.
const ACRONYMS = new Set(['stc', 'aws', 'msc', 'dhl', 'ubs', 'bwt', 'hsbc', 'adnoc', 'tag', 'at&t', 'usa', 'uae', 'uk', 'f1', 'gp'])

// "MSC CRUISES GRANDE PRÊMIO DE SÃO PAULO" -> "MSC Cruises Grande Prêmio de São Paulo"
export function titleCaseName(name) {
  return String(name || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (ACRONYMS.has(word)) return word.toUpperCase()
      const apostrophe = word.match(/^([a-z]')(.+)$/)
      if (apostrophe) return `${index === 0 ? apostrophe[1].toUpperCase() : apostrophe[1]}${apostrophe[2][0].toUpperCase()}${apostrophe[2].slice(1)}`
      if (index > 0 && SMALL_WORDS.has(word)) return word
      return word[0].toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS)
}
