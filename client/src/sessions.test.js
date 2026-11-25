import { test } from 'bun:test'
import assert from 'node:assert'
import { describeSession, isTimeTbc, weekendKey } from './sessions.js'

const feed = (part, type, extra = {}) => ({ type, raw_summary: `🏎 FORMULA 1 QATAR AIRWAYS QATAR GRAND PRIX 2026 - ${part}`, date: '2026-11-27T13:30:00.000Z', end_date: '2026-11-27T14:30:00.000Z', ...extra })

test('feed session titles become short codes', () => {
  assert.deepStrictEqual(describeSession(feed('Practice 2', 'practice')), { code: 'FP2', slug: 'fp2', name: 'Practice 2' })
  assert.strictEqual(describeSession(feed('Sprint Qualification (TBC)', 'qualifying')).code, 'SQ')
  assert.strictEqual(describeSession(feed('Sprint Shootout', 'qualifying')).code, 'SQ')
  assert.strictEqual(describeSession(feed('Sprint Race (TBC)', 'sprint')).code, 'Sprint')
  assert.strictEqual(describeSession(feed('Qualifying', 'qualifying')).code, 'Q')
  assert.strictEqual(describeSession(feed('Race', 'race')).code, 'Race')
})

test('sessions without a usable title fall back to their type', () => {
  assert.strictEqual(describeSession({ type: 'practice', raw_summary: null }).name, 'Practice')
  assert.strictEqual(describeSession({ type: 'custom', source: 'custom', name: 'Watch party' }).name, 'Watch party')
})

test('date-only feed entries are time TBC', () => {
  assert.strictEqual(isTimeTbc(feed('Race (TBC)', 'race')), true)
  assert.strictEqual(isTimeTbc(feed('Race', 'race', { date: '2027-03-13T23:00:00.000Z', end_date: '2027-03-14T23:00:00.000Z' })), true)
  assert.strictEqual(isTimeTbc(feed('Race', 'race')), false)
  assert.strictEqual(isTimeTbc({ type: 'custom', date: '2026-11-22T18:00:00Z' }), false)
})

test('weekend keys use the season and circuit, or a slug of the name', () => {
  assert.strictEqual(weekendKey(2026, 'losail', 'QATAR GP'), '2026/losail')
  assert.strictEqual(weekendKey(2026, null, 'Gran Premio de la Ciudad de México'), '2026/gran-premio-de-la-ciudad-de-mexico')
})
