import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { kampalaBusinessDate } from '../../src/lib/kampala-business-date.ts'

test('billing business date rolls over at midnight in Kampala', () => {
  assert.equal(kampalaBusinessDate(new Date('2026-11-14T20:59:59Z')), '2026-11-14')
  assert.equal(kampalaBusinessDate(new Date('2026-11-14T21:00:00Z')), '2026-11-15')
  assert.equal(kampalaBusinessDate(new Date('2026-12-31T21:00:00Z')), '2027-01-01')
})
