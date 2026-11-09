const fs = require('fs');
const path = require('path');
const sources = require('./sources');
const geometry = require('./geometry');
const registryStore = require('./registry');

const HISTORY_SEASONS = 8;
const GEOJSON_MATCH_DISTANCE_KM = 1;
const OSM_RETRY_INTERVAL_MS = 20 * 60 * 60 * 1000;
const UNKNOWN_EVENT_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

let runningSync = null;
let lastUnknownEventSyncAt = 0;

function scheduleSeasonsToFetch(existing, currentYear) {
  const known = new Set(existing.schedule.map((row) => row.season));
  const seasons = [];
  for (let season = currentYear - HISTORY_SEASONS + 1; season <= currentYear + 1; season += 1) {
    // Past seasons never change, so they are only downloaded once.
    if (season >= currentYear - 1 || !known.has(season)) {
      seasons.push(season);
    }
  }
  return seasons;
}

function mergeSchedule(existing, fetched, currentYear) {
  const firstSeason = currentYear - HISTORY_SEASONS + 1;
  const replaced = new Set(
    Object.entries(fetched)
      .filter(([, rows]) => rows.length > 0)
      .map(([season]) => Number(season))
  );
  const kept = existing.schedule.filter((row) => row.season >= firstSeason && !replaced.has(row.season));
  return [...kept, ...Object.values(fetched).flat()].sort((a, b) => a.date.localeCompare(b.date));
}

function circuitsFromSchedule(schedule) {
  const circuits = new Map();
  for (const row of schedule) {
    const entry = circuits.get(row.circuitId) || { seasons: new Set() };
    entry.seasons.add(row.season);
    Object.assign(entry, {
      id: row.circuitId,
      name: row.circuitName,
      city: row.city,
      country: row.country,
      lat: row.lat,
      lon: row.lon
    });
    circuits.set(row.circuitId, entry);
  }
  return [...circuits.values()]
    .map((entry) => ({ ...entry, seasons: [...entry.seasons].sort((a, b) => a - b) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function loadGeoJson(outputDir, log) {
  const file = path.join(outputDir, registryStore.GEOJSON_FILE);
  try {
    const data = await sources.fetchCircuitGeoJson();
    const content = JSON.stringify(data);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      registryStore.writeFileAtomic(file, content);
    }
    return data;
  } catch (error) {
    log.warn(`Circuit GeoJSON download failed, using local snapshot: ${error.message}`);
  }

  for (const candidate of [file, path.join(registryStore.SEED_DIR, registryStore.GEOJSON_FILE)]) {
    try {
      const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (sources.isValidGeoJson(data)) {
        return data;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log.warn(`Ignoring unreadable GeoJSON snapshot ${candidate}: ${error.message}`);
      }
    }
  }
  return { features: [] };
}

function readOverride(id, log) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(registryStore.OVERRIDES_DIR, `${id}.geojson`), 'utf8'));
    const feature = data.type === 'FeatureCollection' ? data.features?.[0] : data;
    return feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log.warn(`Ignoring invalid override for ${id}: ${error.message}`);
    }
    return null;
  }
}

function findGeoJsonLine(features, circuit) {
  let best = null;
  for (const feature of features) {
    const distance = geometry.distanceToLineKm(feature.geometry.coordinates, circuit.lat, circuit.lon);
    if (!best || distance < best.distance) {
      best = { coords: feature.geometry.coordinates, distance };
    }
  }
  return best && best.distance <= GEOJSON_MATCH_DISTANCE_KM ? best.coords : null;
}

async function findOsmLine(circuit, previous, now, log) {
  const lastTriedAt = previous?.osmLastTriedAt ? Date.parse(previous.osmLastTriedAt) : 0;
  if (now - lastTriedAt < OSM_RETRY_INTERVAL_MS) {
    return { coords: null, triedAt: previous.osmLastTriedAt };
  }

  const triedAt = new Date(now).toISOString();
  try {
    const ways = await sources.fetchOsmWays(circuit.lat, circuit.lon);
    return { coords: geometry.extractOsmLap(ways, circuit), triedAt };
  } catch (error) {
    log.warn(`OpenStreetMap lookup failed for ${circuit.id}: ${error.message}`);
    return { coords: null, triedAt };
  }
}

async function resolveLine(circuit, previous, features, activeSeasons, now, log) {
  const override = readOverride(circuit.id, log);
  if (override && geometry.validateLine(override, circuit).ok) {
    return { coords: override, source: 'override' };
  }

  const fromGeoJson = findGeoJsonLine(features, circuit);
  if (fromGeoJson) {
    const result = geometry.validateLine(fromGeoJson, circuit);
    if (result.ok) {
      return { coords: fromGeoJson, source: 'geojson' };
    }
    log.warn(`Rejected GeoJSON line for ${circuit.id}: ${result.reason}`);
  }

  if (previous?.geometryHash) {
    return { coords: null, source: previous.geometrySource, osmLastTriedAt: previous.osmLastTriedAt };
  }

  if (circuit.seasons.some((season) => activeSeasons.has(season))) {
    const { coords, triedAt } = await findOsmLine(circuit, previous, now, log);
    return { coords, source: coords ? 'osm' : null, osmLastTriedAt: triedAt };
  }

  return { coords: null, source: null };
}

function writeTrack(outputDir, id, coords) {
  const svg = geometry.buildSvg(coords);
  const png = geometry.renderPng(svg);
  const trackDir = path.join(outputDir, 'tracks');
  registryStore.writeFileAtomic(path.join(trackDir, registryStore.trackFileName(id, 'png')), png);
  registryStore.writeFileAtomic(path.join(trackDir, registryStore.trackFileName(id, 'svg')), svg);
}

async function buildCircuits(schedule, existing, features, outputDir, trackDirs, currentYear, now, log) {
  const previousById = new Map(existing.circuits.map((circuit) => [circuit.id, circuit]));
  const activeSeasons = new Set([currentYear, currentYear + 1]);
  const hasFiles = (id) => Boolean(registryStore.findTrackFile(id, 'svg', trackDirs) && registryStore.findTrackFile(id, 'png', trackDirs));
  const circuits = [];
  const missing = [];
  let generated = 0;

  for (const base of circuitsFromSchedule(schedule)) {
    const known = previousById.get(base.id);
    const previous = known?.geometryHash && !hasFiles(base.id) ? { ...known, geometryHash: null } : known;
    const line = await resolveLine(base, previous, features, activeSeasons, now, log);
    const circuit = { ...base, geometrySource: line.source || null, geometryHash: previous?.geometryHash || null };

    if (line.osmLastTriedAt) {
      circuit.osmLastTriedAt = line.osmLastTriedAt;
    }

    if (line.coords) {
      const hash = geometry.geometryHash(line.coords);
      if (hash !== circuit.geometryHash || !hasFiles(base.id)) {
        writeTrack(outputDir, base.id, line.coords);
        generated += 1;
      }
      circuit.geometryHash = hash;
    }

    if (!circuit.geometryHash) {
      circuit.geometrySource = null;
      missing.push(base.id);
      if (base.seasons.some((season) => activeSeasons.has(season))) {
        log.warn(`No usable track geometry for ${base.id} (${base.name}); showing a placeholder`);
      }
    }

    circuits.push(circuit);
  }

  return { circuits, generated, missing };
}

function saveRegistry(outputDir, registry) {
  const file = path.join(outputDir, registryStore.REGISTRY_FILE);
  const content = `${JSON.stringify(registry, null, 2)}\n`;
  const unchanged = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content;
  if (!unchanged) {
    registryStore.writeFileAtomic(file, content);
  }
  return !unchanged;
}

async function runSync({ outputDir, existing, trackDirs, log }) {
  const now = Date.now();
  const currentYear = new Date(now).getUTCFullYear();
  const fetched = await sources.fetchSchedules(scheduleSeasonsToFetch(existing, currentYear));
  const schedule = mergeSchedule(existing, fetched, currentYear);
  if (schedule.length === 0) {
    throw new Error('Schedule source returned no races');
  }

  const geoJson = await loadGeoJson(outputDir, log);
  const { circuits, generated, missing } = await buildCircuits(schedule, existing, geoJson.features, outputDir, trackDirs, currentYear, now, log);
  const changed = saveRegistry(outputDir, { circuits, schedule });
  log.info(`Track sync finished: ${circuits.length} circuits, ${generated} tracks regenerated, ${missing.length} without geometry`);
  return { circuits: circuits.length, generated, missing, changed };
}

// Refreshes runtime data. A failed source leaves every existing file untouched.
function trackSync({ log = console } = {}) {
  if (!runningSync) {
    const outputDir = registryStore.generatedDir();
    runningSync = runSync({
      outputDir,
      existing: registryStore.loadRegistry(),
      trackDirs: [outputDir, registryStore.SEED_DIR],
      log
    }).finally(() => {
      runningSync = null;
    });
  }
  return runningSync;
}

function buildSeed({ log = console } = {}) {
  const outputDir = registryStore.SEED_DIR;
  return runSync({
    outputDir,
    existing: registryStore.readRegistry(outputDir) || registryStore.emptyRegistry(),
    trackDirs: [outputDir],
    log
  });
}

function requestSyncForUnknownEvents(log = console) {
  const now = Date.now();
  if (now - lastUnknownEventSyncAt < UNKNOWN_EVENT_SYNC_INTERVAL_MS) {
    return;
  }
  lastUnknownEventSyncAt = now;
  trackSync({ log }).catch((error) => log.error('Unscheduled track sync failed:', error.message || error));
}

module.exports = {
  buildSeed,
  requestSyncForUnknownEvents,
  trackSync
};
