const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_BEFORE_RACE = 4;
const DAYS_AFTER_RACE = 1;

const COUNTRY_ALIASES = {
  usa: 'united states',
  us: 'united states',
  'united states of america': 'united states',
  uk: 'united kingdom',
  'great britain': 'united kingdom',
  britain: 'united kingdom',
  uae: 'united arab emirates',
  turkiye: 'turkey'
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalCountry(value) {
  const normalized = normalizeText(value);
  return COUNTRY_ALIASES[normalized] || normalized;
}

function containsPhrase(text, phrase) {
  return Boolean(phrase) && ` ${text} `.includes(` ${phrase} `);
}

function dayOfYear(date) {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY_MS);
}

function circuitDayDistance(row, eventDate) {
  const difference = Math.abs(dayOfYear(new Date(`${row.date}T00:00:00Z`)) - dayOfYear(eventDate));
  return Math.min(difference, 365 - difference);
}

function findScheduledRace(schedule, eventDate) {
  const eventDay = Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate());
  let best = null;

  for (const row of schedule) {
    const raceDay = Date.parse(`${row.date}T00:00:00Z`);
    const offset = (eventDay - raceDay) / DAY_MS;
    if (offset >= -DAYS_BEFORE_RACE && offset <= DAYS_AFTER_RACE && (!best || Math.abs(offset) < best.distance)) {
      best = { row, distance: Math.abs(offset) };
    }
  }

  return best?.row || null;
}

function namesFromGrandPrixTitle(row) {
  return [normalizeText(row.city), normalizeText(row.raceName).replace(/ grand prix$/, '')];
}

// Used for seasons the schedule source has not published yet, and for events
// outside a race weekend such as pre-season testing.
function findLikelyRace(schedule, eventName, eventCountry, eventDate) {
  const country = canonicalCountry(eventCountry);
  if (!country) {
    return null;
  }

  const candidates = schedule.filter((row) => canonicalCountry(row.country) === country);
  if (candidates.length === 0) {
    return null;
  }

  const title = normalizeText(eventName);
  const named = candidates
    .filter((row) => namesFromGrandPrixTitle(row).some((name) => containsPhrase(title, name)))
    .sort((a, b) => b.season - a.season);
  if (named.length > 0) {
    return named[0];
  }

  const latestSeason = Math.max(...candidates.map((row) => row.season));
  return candidates
    .filter((row) => row.season === latestSeason)
    .sort((a, b) => circuitDayDistance(a, eventDate) - circuitDayDistance(b, eventDate))[0];
}

function matchEvent({ summary, location, date }, registry) {
  const schedule = registry?.schedule || [];
  const eventDate = new Date(date);
  const row = findScheduledRace(schedule, eventDate) || findLikelyRace(schedule, summary, location, eventDate);

  if (!row) {
    return { country: location, city: null, circuit_name: null, lat: null, lon: null, circuit_id: null };
  }

  const circuit = (registry.circuits || []).find((item) => item.id === row.circuitId);
  return {
    country: location,
    city: circuit?.city ?? row.city,
    circuit_name: circuit?.name ?? row.circuitName,
    lat: circuit?.lat ?? row.lat,
    lon: circuit?.lon ?? row.lon,
    circuit_id: row.circuitId
  };
}

module.exports = { matchEvent };
