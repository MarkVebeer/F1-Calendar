// Daily weather for the race weekends the site shows a forecast for.
// A background job fetches it from Meteoblue and stores it; /api/weather only reads the stored copy.

const db = require('./db');
const { fetchBasicDayForecast, pickDayForecast } = require('./meteoblueService');
const { resolveEventTimeZone, resolveWeatherLocation, getDatePartsInTimeZone, formatDateParts } = require('./weatherWorker');
const { isTimeTbc, weekendKey } = require('../client/src/sessions.js');

const DAY_MS = 24 * 60 * 60 * 1000;
// Meteoblue's basic-day package reaches seven days ahead.
const FORECAST_HORIZON_MS = 7 * DAY_MS;
const AFTER_WEEKEND_MS = 6 * 60 * 60 * 1000;

const round = (value) => (Number.isFinite(value) ? Math.round(value) : null);

// Weekends (by season and Grand Prix) whose sessions fall inside the forecast horizon.
function weekendsInForecastWindow(events, now = new Date()) {
  const weekends = new Map();
  for (const event of events) {
    if (event.source === 'custom' || isTimeTbc(event)) continue;
    const season = new Date(event.date).getUTCFullYear();
    const key = weekendKey(season, event.circuit_id, event.name);
    if (!weekends.has(key)) weekends.set(key, { key, events: [] });
    weekends.get(key).events.push(event);
  }

  const nowMs = now.getTime();
  return [...weekends.values()].filter(({ events: weekendEvents }) => {
    const starts = weekendEvents.map((event) => new Date(event.date).getTime());
    const ends = weekendEvents.map((event) => new Date(event.end_date || event.date).getTime());
    return Math.max(...ends) + AFTER_WEEKEND_MS >= nowMs && Math.min(...starts) <= nowMs + FORECAST_HORIZON_MS;
  });
}

// One entry per circuit-local day that has a session, in the order they happen.
function forecastDays(forecast, events, timeZone) {
  const dates = [...new Set(events
    .map((event) => formatDateParts(getDatePartsInTimeZone(new Date(event.date), timeZone)))
  )].sort();

  return dates
    .map((date) => {
      const picked = pickDayForecast(forecast, date);
      if (!picked) return null;
      const v = picked.values;
      return {
        date,
        tempMax: round(v.temperature_max),
        tempMin: round(v.temperature_min),
        rainChance: round(v.precipitation_probability),
        rainMm: Number.isFinite(v.precipitation) ? Math.round(v.precipitation * 10) / 10 : null,
        windMax: round(v.windspeed_max),
        pictocode: Number.isFinite(v.pictocode) ? v.pictocode : null
      };
    })
    .filter(Boolean);
}

async function refreshWeatherForecasts({ now = new Date(), fetchForecast = fetchBasicDayForecast } = {}) {
  if (!process.env.METEOBLUE_API_KEY) {
    return { skipped: 'METEOBLUE_API_KEY is not set' };
  }

  const weekends = weekendsInForecastWindow(await db.getAllEvents(), now);
  let saved = 0;
  for (const weekend of weekends) {
    const sorted = [...weekend.events].sort((a, b) => new Date(a.date) - new Date(b.date));
    try {
      const timeZone = resolveEventTimeZone(sorted[0]) || 'UTC';
      const location = await resolveWeatherLocation(sorted[0], timeZone);
      const forecast = await fetchForecast({
        lat: location.lat,
        lon: location.lon,
        asl: location.asl,
        tz: location.timezone || timeZone,
        name: location.name
      });
      const days = forecastDays(forecast, sorted, location.timezone || timeZone);
      if (days.length > 0) {
        await db.saveWeatherForecast(weekend.key, days);
        saved += 1;
      }
    } catch (error) {
      console.error(`Weather forecast for ${weekend.key} failed, keeping the last one:`, error.message || error);
    }
  }

  // Keep forecasts only for weekends still in the window, including ones whose refresh just failed.
  await db.pruneWeatherForecasts(weekends.map((weekend) => weekend.key));
  return { weekends: weekends.length, saved };
}

module.exports = { refreshWeatherForecasts, weekendsInForecastWindow, forecastDays };
