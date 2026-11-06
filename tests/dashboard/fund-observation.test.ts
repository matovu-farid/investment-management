import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { latestFundObservations } from '../../src/lib/latest-fund-observation.ts'

test('dashboard keeps every non-void observation on the latest active date', () => {
  const items = [
    { id: 'voided-newest', observedDate: '2026-11-06', voidedAt: '2026-11-06 08:00:00' },
    { id: 'one', observedDate: '2026-11-05', voidedAt: null },
    { id: 'two', observedDate: '2026-11-05', voidedAt: null },
    { id: 'voided-same-date', observedDate: '2026-11-05', voidedAt: '2026-11-06' },
    { id: 'older', observedDate: '2026-11-04', voidedAt: null },
  ]
  assert.deepEqual(latestFundObservations(items).map(o => o.id), ['one', 'two'])
  assert.deepEqual(latestFundObservations([{ id: 'voided', observedDate: '2026-11-06', voidedAt: '2026-11-06' }]), [])
  assert.deepEqual(latestFundObservations([]), [])
})
