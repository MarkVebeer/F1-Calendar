// Session naming and weekend keys, shared by the site and the Discord worker (server requires this file).

const TBC_PATTERN = /\(\s*tbc\s*\)/i
// The feed marks unknown times as whole-day entries; anything this long is not a real session time.
const ALL_DAY_MS = 20 * 60 * 60 * 1000

// The part of the feed title after "<GP name> <year> - ", e.g. "Practice 2" or "Sprint Qualification (TBC)".
function sessionPart(rawSummary) {
  const text = String(rawSummary || '')
  const index = text.lastIndexOf(' - ')
  return (index >= 0 ? text.slice(index + 3) : text).replace(TBC_PATTERN, '').trim()
}

const FALLBACK = {
  practice: { code: 'FP', slug: 'fp', name: 'Practice' },
  qualifying: { code: 'Q', slug: 'q', name: 'Qualifying' },
  sprint: { code: 'Sprint', slug: 'sprint', name: 'Sprint' },
  race: { code: 'Race', slug: 'race', name: 'Race' }
}

// { code: 'FP2', slug: 'fp2', name: 'Practice 2' } for a feed session; custom events keep their own name.
export function describeSession(event) {
  if (!event) return null
  if (event.type === 'custom' || event.source === 'custom') {
    return { code: 'Event', slug: 'event', name: event.name || 'Event' }
  }

  const part = sessionPart(event.raw_summary).toLowerCase()
  const practice = part.match(/practice\s*(\d)/) || part.match(/\bfp\s*(\d)/)
  if (practice) {
    return { code: `FP${practice[1]}`, slug: `fp${practice[1]}`, name: `Practice ${practice[1]}` }
  }
  if (/sprint\s*(qualif|shootout)/.test(part)) {
    return { code: 'SQ', slug: 'sq', name: 'Sprint Qualifying' }
  }
  if (/sprint/.test(part)) {
    return { code: 'Sprint', slug: 'sprint', name: 'Sprint' }
  }
  if (/qualif/.test(part)) {
    return { code: 'Q', slug: 'q', name: 'Qualifying' }
  }
  if (/race/.test(part)) {
    return { code: 'Race', slug: 'race', name: 'Race' }
  }
  return FALLBACK[event.type] || { code: 'Session', slug: 'session', name: 'Session' }
}

// True when the feed has a date but no real start time for this session yet.
export function isTimeTbc(event) {
  if (!event) return false
  if (TBC_PATTERN.test(String(event.raw_summary || ''))) return true
  if (!event.end_date) return false
  return new Date(event.end_date).getTime() - new Date(event.date).getTime() >= ALL_DAY_MS
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// "2026/losail": the season plus the circuit (or the name when no circuit is known). Used in #/<key> deep links.
export function weekendKey(season, circuitId, name) {
  return `${season}/${circuitId || slugify(name) || 'weekend'}`
}
