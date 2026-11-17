import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { quadrimesterDates } from '../../src/lib/quadrimester.ts'

test('calendar quadrimesters match the board report and reject incomplete input', () => {
  assert.deepEqual(quadrimesterDates('2026', '1'), { start: '2026-01-01', end: '2026-04-30' })
  assert.deepEqual(quadrimesterDates('2026', '2'), { start: '2026-05-01', end: '2026-08-31' })
  assert.deepEqual(quadrimesterDates('2028', '3'), { start: '2028-09-01', end: '2028-12-31' })
  assert.equal(quadrimesterDates('20', '1'), null)
  assert.equal(quadrimesterDates('2026', '4'), null)
})
