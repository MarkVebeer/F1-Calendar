import { test } from 'bun:test'
import assert from 'node:assert'
import { formatDay, formatTime, dayKey, timeZoneLabel, formatDateRange, countdownParts, titleCaseName, timeZoneCity, dateBlock, allDayInZone, zonedTimeToDate } from './format.js'
import { isAllDay } from './sessions.js'

test('a whole-day entry shows its own date in every timezone', () => {
  // Pre-season testing day with no time yet: stored as midnight UTC of 24 Feb.
  for (const zone of ['UTC', 'America/Los_Angeles', 'Europe/Budapest', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const day = allDayInZone('2027-02-24T00:00:00.000Z', zone)
    assert.strictEqual(dayKey(day, zone), '2027-02-24', zone)
    assert.strictEqual(formatDay(day, zone), 'Wed 24 Feb', zone)
  }
  assert.strictEqual(isAllDay({ date: '2027-02-24T00:00:00.000Z', end_date: '2027-02-25T00:00:00.000Z' }), true)
  // A real session, and an old row saved at a server's local midnight, stay moments.
  assert.strictEqual(isAllDay({ date: '2027-03-14T05:00:00.000Z', end_date: '2027-03-14T07:00:00.000Z' }), false)
  assert.strictEqual(isAllDay({ date: '2027-02-23T23:00:00.000Z', end_date: '2027-02-24T23:00:00.000Z' }), false)
})

test('the zone name follows daylight saving on the given date', () => {
  assert.strictEqual(timeZoneLabel('Europe/Budapest', '2027-06-06T13:00:00Z'), 'CEST')
  assert.strictEqual(timeZoneLabel('Europe/Budapest', '2027-01-06T13:00:00Z'), 'CET')
})

test('a typed wall-clock time is read in the chosen zone', () => {
  assert.strictEqual(zonedTimeToDate('2027-01-10T15:00', 'Europe/Budapest').toISOString(), '2027-01-10T14:00:00.000Z')
  assert.strictEqual(zonedTimeToDate('2027-07-10T15:00', 'Europe/Budapest').toISOString(), '2027-07-10T13:00:00.000Z')
  assert.strictEqual(zonedTimeToDate('2027-07-10T15:00', 'America/New_York').toISOString(), '2027-07-10T19:00:00.000Z')
  // Just after the spring change in Budapest (28 Mar 2027, 02:00 -> 03:00).
  assert.strictEqual(zonedTimeToDate('2027-03-28T03:30', 'Europe/Budapest').toISOString(), '2027-03-28T01:30:00.000Z')
})

test('session times read as weekday, date and time in the chosen zone', () => {
  assert.strictEqual(formatDay('2026-11-27T13:30:00Z', 'Europe/Budapest'), 'Fri 27 Nov')
  assert.strictEqual(formatTime('2026-11-27T13:30:00Z', 'Europe/Budapest'), '14:30')
  assert.strictEqual(timeZoneLabel('Europe/Budapest', '2026-11-27T13:30:00Z'), 'CET')
  assert.strictEqual(timeZoneLabel('America/New_York', '2026-11-27T13:30:00Z'), 'EST')
  assert.match(timeZoneLabel('Asia/Qatar', '2026-11-27T13:30:00Z'), /^(GMT|UTC)\+3$/)
  assert.strictEqual(timeZoneCity('America/Los_Angeles'), 'Los Angeles')
})

test('grouping uses the calendar day of the chosen zone', () => {
  // Las Vegas FP1 is Thursday evening locally but Friday in Budapest.
  assert.strictEqual(dayKey('2026-11-20T00:30:00Z', 'America/Los_Angeles'), '2026-11-19')
  assert.strictEqual(dayKey('2026-11-20T00:30:00Z', 'Europe/Budapest'), '2026-11-20')
})

test('weekend ranges stay short', () => {
  assert.strictEqual(formatDateRange('2026-11-27T13:30:00Z', '2026-11-29T16:00:00Z', 'Europe/Budapest'), '27–29 Nov')
  assert.strictEqual(formatDateRange('2026-11-30T13:30:00Z', '2026-12-01T16:00:00Z', 'Europe/Budapest'), '30 Nov – 1 Dec')
  assert.strictEqual(formatDateRange('2026-11-27T13:30:00Z', '2026-11-27T16:00:00Z', 'Europe/Budapest'), '27 Nov')
})

test('countdown parts and title-cased names', () => {
  assert.deepStrictEqual(countdownParts(2 * 86400e3 + 5 * 3600e3 + 20 * 60e3 + 16e3), { days: 2, hours: 5, minutes: 20, seconds: 16 })
  assert.deepStrictEqual(countdownParts(-5), { days: 0, hours: 0, minutes: 0, seconds: 0 })
  assert.strictEqual(titleCaseName('QATAR AIRWAYS QATAR GRAND PRIX'), 'Qatar Airways Qatar Grand Prix')
  assert.strictEqual(titleCaseName('GRAN PREMIO DE LA CIUDAD DE MÉXICO'), 'Gran Premio de la Ciudad de México')
  assert.strictEqual(titleCaseName("PIRELLI GRAN PREMIO D'ITALIA"), "Pirelli Gran Premio d'Italia")
  assert.strictEqual(titleCaseName('MSC CRUISES GRANDE PRÊMIO DE SÃO PAULO'), 'MSC Cruises Grande Prêmio de São Paulo')
  assert.strictEqual(titleCaseName('STC SAUDI ARABIAN GRAND PRIX'), 'STC Saudi Arabian Grand Prix')
  assert.strictEqual(titleCaseName('AWS GRAND PRIX DU CANADA'), 'AWS Grand Prix du Canada')
  assert.strictEqual(titleCaseName('TAG HEUER BRITISH GRAND PRIX'), 'TAG Heuer British Grand Prix')
})

test('date blocks keep a three-letter month column', () => {
  assert.deepStrictEqual(dateBlock('2027-09-03T10:00:00Z', '2027-09-05T14:00:00Z', 'Europe/Budapest'), { month: 'Sep', days: '3–5' })
  assert.deepStrictEqual(dateBlock('2027-04-30T10:00:00Z', '2027-05-03T14:00:00Z', 'Europe/Budapest'), { month: 'Apr–May', days: '30–3' })
})
