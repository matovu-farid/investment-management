import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createLoan, createBooking, createFulfilment, listLending, type LendingRepository } from '../../src/server/lending/service.ts'

function fixture(role: string | null = 'admin') {
  let writes = 0
  const repo: LendingRepository = {
    roleFor: async () => role,
    list: async () => ({ loans: [], bookings: [], fulfilments: [], repayments: [] }),
    loanDate: async () => '2026-01-01',
    bookingDate: async () => '2026-01-01',
    createRepayment: async value => { writes++; return value },
    memberIsActive: async id => id === 'member-1',
    createFulfilment: async value => { writes++; return value },
    createLoan: async loan => { writes++; return loan },
    createBooking: async booking => { writes++; return booking },
  }
  return { repo, writes: () => writes }
}
const loan = { idempotencyKey: 'b75610af-140f-46d8-ac6c-a4be05c42b01', memberId: 'member-1', principalMinor: 100000, currency: 'UGX', disbursementDate: '2026-01-01', maturityDate: '2026-12-31', terms: 'As agreed' }
const booking = { idempotencyKey: 'b75610af-140f-46d8-ac6c-a4be05c42b02', memberId: 'member-1', requestedMinor: 25000, currency: 'UGX', requestedDate: '2026-01-01' }

test('requires explicit administrator access for all operations', async () => {
  for (const role of [null, 'member']) {
    const f = fixture(role)
    await assert.rejects(listLending(f.repo, 'u'), /unauthorized/i)
    await assert.rejects(createLoan(f.repo, 'u', loan), /unauthorized/i)
    await assert.rejects(createBooking(f.repo, 'u', booking), /unauthorized/i)
    assert.equal(f.writes(), 0)
  }
  await assert.rejects(listLending(fixture().repo, null), /unauthorized/i)
})

test('records independent loan and booking facts for an active member', async () => {
  const { repo } = fixture()
  const one = await createLoan(repo, 'u', loan)
  const two = await createLoan(repo, 'u', loan)
  assert.notEqual(one.id, two.id)
  assert.equal(one.createdBy, 'u')
  assert.equal((await createBooking(repo, 'u', booking)).requestedMinor, 25000)
})

test('rejects invalid dates, amounts, currency, missing terms and inactive members', async () => {
  const f = fixture()
  for (const input of [null, {...loan, memberId: 'inactive'}, {...loan, principalMinor: 1.5}, {...loan, principalMinor: Number.MAX_SAFE_INTEGER + 1}, {...loan, currency: 'ugx'}, {...loan, disbursementDate: '2026-02-30'}, {...loan, maturityDate: '2025-01-01'}, {...loan, terms: ' '}]) {
    await assert.rejects(createLoan(f.repo, 'u', input), /invalid/i)
  }
  await assert.rejects(createBooking(f.repo, 'u', {...booking, requestedMinor: 0}), /invalid/i)
  assert.equal(f.writes(), 0)
})

test('requires a valid client idempotency key', async () => {
  const f = fixture()
  await assert.rejects(createLoan(f.repo, 'u', {...loan, idempotencyKey: 'bad'}), /invalid/i)
  await assert.rejects(createBooking(f.repo, 'u', {...booking, idempotencyKey: undefined}), /invalid/i)
})

test('fulfilments require admin and valid input', async () => {
  const input = { idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b03', bookingId:'booking', amountMinor: 50, fulfilmentDate:'2026-01-02' }
  await assert.rejects(createFulfilment(fixture(null).repo, 'u', input), /unauthorized/i)
  const repo = fixture().repo
  await assert.rejects(createFulfilment(repo, 'u', {...input, amountMinor: 0}), /invalid/i)
  assert.equal((await createFulfilment(repo, 'u', input)).amountMinor, 50)
})
