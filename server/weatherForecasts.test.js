const { test } = require('bun:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-weather-'));
Object.assign(process.env, { DATA_DIR: dataDir, TRACK_DATA_DIR: path.join(dataDir, 'tracks'), METEOBLUE_API_KEY: 'test-key' });

const db = require('./db');
const { refreshWeatherForecasts, weekendsInForecastWindow } = require('./weatherForecasts');

const NOW = new Date('2026-11-25T12:00:00Z');
const session = (uid, part, date, extra = {}) => ({
  name: 'QATAR AIRWAYS QATAR GRAND PRIX',
  location: 'Qatar',
  date,
  end_date: new Date(new Date(date).getTime() + 3600e3).toISOString(),
  type: part.startsWith('Race') ? 'race' : 'practice',
  ics_uid: uid,
  raw_summary: `FORMULA 1 QATAR AIRWAYS QATAR GRAND PRIX 2026 - ${part}`,
  circuit_id: 'losail',
  lat: 25.49,
  lon: 51.45,
  timezone: 'Asia/Qatar',
  ...extra
});

const qatar = [
  session('q1', 'Practice 1', '2026-11-27T13:30:00.000Z'),
  session('q2', 'Race', '2026-11-29T16:00:00.000Z')
];
const farAway = session('a1', 'Practice 1', '2026-12-04T09:30:00.000Z', { name: 'ABU DHABI GP', circuit_id: 'yas_marina', timezone: 'Asia/Dubai' });
const tbc = session('t1', 'Race (TBC)', '2026-11-28T21:00:00.000Z', { name: 'TBC GP', circuit_id: 'tbc_track' });

// A stand-in for Meteoblue's basic-day package.
const fakeForecast = async () => ({
  units: {},
  data_day: {
    time: ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
    temperature_max: [27.4, 26.6, 25.1, 24.4],
    temperature_min: [20, 19.6, 19.2, 18.4],
    precipitation_probability: [0, 5, 10, 0],
    precipitation: [0, 0, 0.24, 0],
    windspeed_max: [18, 22.4, 25, 15],
    pictocode: [1, 2, 3, 1]
  }
});

test('only non-TBC weekends inside the seven-day horizon are refreshed', async () => {
  await db.initDatabase();
  await db.replaceRaces([...qatar, farAway, tbc]);
  const events = await db.getAllEvents();
  assert.deepStrictEqual(weekendsInForecastWindow(events, NOW).map((weekend) => weekend.key), ['2026/losail']);
});

test('a refresh stores one forecast day per circuit-local session day', async () => {
  const result = await refreshWeatherForecasts({ now: NOW, fetchForecast: fakeForecast });
  assert.deepStrictEqual(result, { weekends: 1, saved: 1 });

  const { '2026/losail': stored } = await db.getWeatherForecasts();
  assert.deepStrictEqual(stored.days.map((day) => day.date), ['2026-11-27', '2026-11-29']);
  assert.deepStrictEqual(stored.days[0], { date: '2026-11-27', tempMax: 27, tempMin: 20, rainChance: 5, rainMm: 0, windMax: 22, pictocode: 2 });
});

test('a failed refresh keeps the last forecast', async () => {
  const failing = async () => { throw new Error('Meteoblue is down'); };
  const result = await refreshWeatherForecasts({ now: NOW, fetchForecast: failing });
  assert.deepStrictEqual(result, { weekends: 1, saved: 0 });
  assert.ok((await db.getWeatherForecasts())['2026/losail']);
});

test('without an API key nothing is fetched', async () => {
  delete process.env.METEOBLUE_API_KEY;
  let called = false;
  const result = await refreshWeatherForecasts({ now: NOW, fetchForecast: async () => { called = true; } });
  assert.ok(result.skipped);
  assert.strictEqual(called, false);
});
