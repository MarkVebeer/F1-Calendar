import test from 'node:test'
import assert from 'node:assert'
import { buildWeekendTimeline, groupBySeason, isWeekendFinished, selectVisibleWeekends } from './weekends.js'

const HOUR = 60 * 60 * 1000

function grandPrix(season, name, ...dates) {
  return { name, season, events: dates.map(date => ({ date })) }
}

const grouped = {
  '2026 qatar': grandPrix(2026, 'QATAR GP', '2026-11-27T12:00:00Z', '2026-11-29T16:00:00Z'),
  '2026 brazil': grandPrix(2026, 'BRAZIL GP', '2026-11-06T12:00:00Z', '2026-11-08T17:00:00Z'),
  '2026 mexico': grandPrix(2026, 'MEXICO GP', '2026-10-30T12:00:00Z', '2026-11-01T20:00:00Z'),
  '2026 usa': grandPrix(2026, 'USA GP', '2026-10-23T12:00:00Z', '2026-10-25T20:00:00Z'),
  '2027 qatar': grandPrix(2027, 'QATAR GP', '2027-12-03T12:00:00Z', '2027-12-05T16:00:00Z')
}

const timeline = buildWeekendTimeline(grouped)
const now = Date.parse('2026-11-09T12:00:00Z')
const keys = (weekends) => weekends.map(weekend => weekend.key)

test('the timeline is chronological and keeps same-named seasons apart', () => {
  assert.deepStrictEqual(keys(timeline), ['2026 usa', '2026 mexico', '2026 brazil', '2026 qatar', '2027 qatar'])
})

test('a weekend finishes three hours after its last event starts', () => {
  const brazil = timeline.find(weekend => weekend.key === '2026 brazil')
  const lastEvent = Date.parse('2026-11-08T17:00:00Z')
  assert.strictEqual(isWeekendFinished(brazil, lastEvent + 3 * HOUR - 1), false)
  assert.strictEqual(isWeekendFinished(brazil, lastEvent + 3 * HOUR), true)
})

test('no finished weekend is listed when the count is zero', () => {
  assert.deepStrictEqual(keys(selectVisibleWeekends(timeline, now, 0)), ['2026 qatar', '2027 qatar'])
})

test('the most recent finished weekends come first', () => {
  assert.deepStrictEqual(keys(selectVisibleWeekends(timeline, now, 1)), ['2026 brazil', '2026 qatar', '2027 qatar'])
  assert.deepStrictEqual(keys(selectVisibleWeekends(timeline, now, 2)), ['2026 mexico', '2026 brazil', '2026 qatar', '2027 qatar'])
})

test('a count above the history shows everything available', () => {
  assert.strictEqual(selectVisibleWeekends(timeline, now, 24).length, timeline.length)
})

test('seasons are grouped in year order', () => {
  const seasons = groupBySeason([...timeline].reverse())
  assert.deepStrictEqual(seasons.map(item => item.season), [2026, 2027])
  assert.strictEqual(seasons[0].weekends.length, 4)
  assert.deepStrictEqual(keys(seasons[1].weekends), ['2027 qatar'])
})
