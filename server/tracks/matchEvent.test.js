const test = require('node:test');
const assert = require('node:assert');
const { matchEvent } = require('./matchEvent');
const { buildSvg, extractOsmLap, validateLine } = require('./geometry');
const { SEED_DIR, readRegistry } = require('./registry');

const registry = readRegistry(SEED_DIR);

const cases = [
  ['2026-11-20T00:30:00Z', 'United States', 'FORMULA 1 HEINEKEN LAS VEGAS GRAND PRIX 2026 - Practice 1', 'vegas'],
  ['2026-10-25T20:00:00Z', 'United States', 'FORMULA 1 MSC CRUISES UNITED STATES GRAND PRIX 2026 - Race', 'americas'],
  ['2026-05-03T20:00:00Z', 'United States', 'FORMULA 1 MIAMI GRAND PRIX 2026 - Race', 'miami'],
  ['2026-10-04T08:00:00Z', 'Malaysia', 'FORMULA 1 BAHRAIN GRAND PRIX 2026 - Race', 'sepang'],
  ['2027-02-24', 'Bahrain', 'FORMULA 1 ARAMCO PRE-SEASON TESTING 2027 - Practice 1 (TBC)', 'bahrain'],
  ['2027-03-21', 'Saudi Arabia', 'FORMULA 1 STC SAUDI ARABIAN GRAND PRIX 2027 - Race (TBC)', 'jeddah'],
  ['2027-05-02', 'United States', 'FORMULA 1 HARD ROCK MIAMI GRAND PRIX 2027 - Race (TBC)', 'miami'],
  ['2027-06-20', 'Portugal', 'FORMULA 1 MSC CRUISES GRANDE PRÉMIO DE PORTUGAL 2027 - Race (TBC)', 'portimao'],
  ['2027-09-05', 'Italy', "FORMULA 1 PIRELLI GRAN PREMIO D'ITALIA 2027 - Race (TBC)", 'monza'],
  ['2027-09-12', 'Spain', 'FORMULA 1 LENOVO GRAN PREMIO DE ESPAÑA  2027 - Race (TBC)', 'madring'],
  ['2027-10-03', 'Turkey', 'FORMULA 1 MSC CRUISES TURKISH GRAND PRIX 2027 - Race (TBC)', 'istanbul'],
  ['2027-10-24', 'United States', 'FORMULA 1 PIRELLI UNITED STATES GRAND PRIX 2027 - Race (TBC)', 'americas'],
  ['2027-10-31', 'Mexico', 'FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2027 - Race (TBC)', 'rodriguez'],
  ['2027-11-07', 'Brazil', 'FORMULA 1 HEINEKEN GRANDE PRÊMIO DE SÃO PAULO 2027 - Race (TBC)', 'interlagos'],
  ['2027-11-20', 'United States', 'FORMULA 1 HEINEKEN LAS VEGAS GRAND PRIX 2027 - Race (TBC)', 'vegas'],
  ['2027-12-12', 'United Arab Emirates', 'FORMULA 1 ETIHAD AIRWAYS ABU DHABI GRAND PRIX 2027 - Race (TBC)', 'yas_marina'],
  ['2027-07-04', 'United Kingdom', 'FORMULA 1 TAG HEUER BRITISH GRAND PRIX 2027 - Race (TBC)', 'silverstone']
];

for (const [date, location, summary, expected] of cases) {
  test(`${summary} -> ${expected}`, () => {
    assert.strictEqual(matchEvent({ summary, location, date: new Date(date) }, registry).circuit_id, expected);
  });
}

test('an unknown country has no circuit and keeps the calendar location', () => {
  const result = matchEvent({ summary: 'FORMULA 1 ATLANTIS GRAND PRIX 2027 - Race', location: 'Atlantis', date: new Date('2027-08-15') }, registry);
  assert.strictEqual(result.circuit_id, null);
  assert.strictEqual(result.country, 'Atlantis');
});

function ring(lat, lon, radius, points = 60) {
  const coords = [];
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    coords.push([lon + radius * Math.cos(angle), lat + radius * Math.sin(angle)]);
  }
  coords.push(coords[0]);
  return coords;
}

const center = { lat: 47.5, lon: 19.2 };

test('validateLine accepts a closed lap and rejects open or oversized lines', () => {
  const lap = ring(center.lat, center.lon, 0.008);
  assert.ok(validateLine(lap, { lat: center.lat + 0.008, lon: center.lon }).ok);
  assert.strictEqual(validateLine(lap.slice(0, 30), center).ok, false);
  assert.strictEqual(validateLine(ring(center.lat, center.lon, 0.1), center).ok, false);
});

test('buildSvg only emits a numeric path', () => {
  const svg = buildSvg(ring(center.lat, center.lon, 0.008));
  assert.match(svg, /^<svg [^>]+><path d="M[\d. ML]+Z" [^>]+\/><\/svg>\n$/);
});

test('extractOsmLap stitches split ways and ignores pit lanes', () => {
  const lap = ring(center.lat, center.lon, 0.008).map(([lon, lat]) => ({ lat, lon }));
  const ways = [
    { type: 'way', tags: {}, geometry: lap.slice(0, 31) },
    { type: 'way', tags: {}, geometry: lap.slice(30) },
    { type: 'way', tags: { name: 'Pit Lane' }, geometry: [lap[5], { lat: center.lat, lon: center.lon }, lap[25]] }
  ];
  const result = extractOsmLap(ways, { lat: lap[0].lat, lon: lap[0].lon });
  assert.ok(result);
  assert.strictEqual(result.length, 61);
});

test('extractOsmLap rejects layouts with several differing laps', () => {
  const lap = ring(center.lat, center.lon, 0.008).map(([lon, lat]) => ({ lat, lon }));
  const outer = [lap[10], { lat: center.lat + 0.02, lon: center.lon + 0.02 }, lap[20]];
  const ways = [
    { type: 'way', tags: {}, geometry: lap },
    { type: 'way', tags: {}, geometry: outer }
  ];
  assert.strictEqual(extractOsmLap(ways, { lat: lap[0].lat, lon: lap[0].lon }), null);
});
