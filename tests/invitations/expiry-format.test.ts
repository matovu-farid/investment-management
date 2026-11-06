import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatInvitationExpiry } from '../../src/lib/invitation-expiry.ts'

test('invitation expiry is formatted consistently with an explicit UTC zone', () => {
  assert.equal(formatInvitationExpiry(1794061249), '2026-11-07 14:20:49 UTC')
})
