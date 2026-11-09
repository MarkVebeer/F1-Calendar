const axios = require('axios');

const USER_AGENT = 'F1-Calendar/1.0 (+https://github.com/MarkVebeer/F1-Calendar)';
const CIRCUIT_ID_PATTERN = /^[a-z0-9_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OVERPASS_SEARCH_RADIUS_M = 5000;
const JOLPICA_PACING_MS = 400;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function jolpicaBaseUrl() {
  return (process.env.JOLPICA_BASE_URL || 'https://api.jolpi.ca/ergast/f1').replace(/\/+$/, '');
}

function geoJsonUrl() {
  return process.env.TRACK_GEOJSON_URL || 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson';
}

function toScheduleRow(race) {
  const circuit = race?.Circuit;
  const location = circuit?.Location;
  const lat = Number.parseFloat(location?.lat);
  const lon = Number.parseFloat(location?.long);

  if (
    !CIRCUIT_ID_PATTERN.test(circuit?.circuitId || '') ||
    !DATE_PATTERN.test(race?.date || '') ||
    !circuit?.circuitName ||
    !location?.country ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    throw new Error(`Invalid race entry from Jolpica: ${JSON.stringify(race).slice(0, 200)}`);
  }

  return {
    season: Number.parseInt(race.season, 10),
    round: Number.parseInt(race.round, 10),
    date: race.date,
    raceName: race.raceName,
    circuitId: circuit.circuitId,
    circuitName: circuit.circuitName,
    city: location.locality || null,
    country: location.country,
    lat,
    lon
  };
}

async function fetchSeasonSchedule(season) {
  const response = await axios.get(`${jolpicaBaseUrl()}/${season}/races.json?limit=100`, {
    timeout: 20000,
    headers: { 'User-Agent': USER_AGENT }
  });
  const races = response.data?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races)) {
    throw new Error(`Unexpected Jolpica response for season ${season}`);
  }
  return races.map(toScheduleRow);
}

async function fetchSchedules(seasons) {
  const result = {};
  for (const season of seasons) {
    result[season] = await fetchSeasonSchedule(season);
    await sleep(JOLPICA_PACING_MS);
  }
  return result;
}

function isValidGeoJson(data) {
  return (
    Array.isArray(data?.features) &&
    data.features.length >= 10 &&
    data.features.every((feature) => feature?.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates))
  );
}

async function fetchCircuitGeoJson() {
  const response = await axios.get(geoJsonUrl(), {
    timeout: 30000,
    responseType: 'json',
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!isValidGeoJson(response.data)) {
    throw new Error('Unexpected circuit GeoJSON format');
  }
  return response.data;
}

async function fetchOsmWays(lat, lon) {
  const query = `[out:json][timeout:40];way["highway"="raceway"](around:${OVERPASS_SEARCH_RADIUS_M},${lat},${lon});out tags geom;`;
  let lastError = null;

  for (const [index, endpoint] of OVERPASS_ENDPOINTS.entries()) {
    try {
      const response = await axios.post(endpoint, new URLSearchParams({ data: query }).toString(), {
        timeout: 60000,
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (Array.isArray(response.data?.elements)) {
        return response.data.elements;
      }
      lastError = new Error(`Unexpected Overpass response from ${endpoint}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(2000 * 2 ** index);
  }

  throw lastError;
}

module.exports = {
  fetchCircuitGeoJson,
  fetchOsmWays,
  fetchSchedules,
  isValidGeoJson
};
