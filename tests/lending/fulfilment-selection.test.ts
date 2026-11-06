import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { eligibleFulfilmentBookings } from '../../src/lib/fulfilment-selection.ts'

test('only bookings with an eligible status and unfulfilled recorded amount can be selected', () => {
  const bookings = [
    { id: 'waiting', status: 'waiting', requestedMinor: 100, fulfilledMinor: 25 },
    { id: 'held', status: 'held', requestedMinor: 100 },
    { id: 'full', status: 'waiting', requestedMinor: 100, fulfilledMinor: 100 },
    { id: 'closed', status: 'closed', requestedMinor: 100, fulfilledMinor: 0 },
  ]
  assert.deepEqual(eligibleFulfilmentBookings(bookings).map(b => b.id), ['waiting', 'held'])
  assert.equal(eligibleFulfilmentBookings(bookings).some(b => b.id === 'full'), false)
})
