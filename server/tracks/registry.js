const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(DATA_DIR, 'seed');
const OVERRIDES_DIR = path.join(DATA_DIR, 'overrides');
const REGISTRY_FILE = 'circuits.json';
const GEOJSON_FILE = 'f1-circuits.geojson';

function generatedDir() {
  return process.env.TRACK_DATA_DIR ? path.resolve(process.env.TRACK_DATA_DIR) : path.join(DATA_DIR, 'generated');
}

function emptyRegistry() {
  return { circuits: [], schedule: [] };
}

function readRegistry(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, REGISTRY_FILE), 'utf8'));
    if (Array.isArray(parsed?.circuits) && Array.isArray(parsed?.schedule)) {
      return parsed;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Ignoring unreadable circuit registry in ${dir}:`, error.message);
    }
  }
  return null;
}

// The newest cron output wins; the committed seed keeps a fresh clone working offline.
function loadRegistry() {
  return readRegistry(generatedDir()) || readRegistry(SEED_DIR) || emptyRegistry();
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, filePath);
}

function trackFileName(id, extension) {
  return `${id}.${extension}`;
}

function findTrackFile(id, extension, dirs = [generatedDir(), SEED_DIR]) {
  for (const dir of dirs) {
    const candidate = path.join(dir, 'tracks', trackFileName(id, extension));
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

module.exports = {
  GEOJSON_FILE,
  OVERRIDES_DIR,
  REGISTRY_FILE,
  SEED_DIR,
  emptyRegistry,
  findTrackFile,
  generatedDir,
  loadRegistry,
  readRegistry,
  trackFileName,
  writeFileAtomic
};
