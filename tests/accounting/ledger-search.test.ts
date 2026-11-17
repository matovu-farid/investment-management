import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { filterLedgerEntries } from '../../src/lib/ledger-search.ts'

const entries = [
  { description: 'Office rent', effectiveDate: '2026-01-08', currency: 'UGX', sourceType: 'manual', lines: [{ accountCode: '1000', accountName: 'Cash' }] },
  { description: 'Loan payment', effectiveDate: '2026-02-02', currency: 'USD', sourceType: 'repayment', lines: [{ accountCode: '2100', accountName: 'Loan receivable' }] },
]

test('ledger search matches dates, currency and account names without hiding entries for an empty query', () => {
  assert.equal(filterLedgerEntries(entries, '').length, 2)
  assert.deepEqual(filterLedgerEntries(entries, 'RECEIVABLE'), [entries[1]])
  assert.deepEqual(filterLedgerEntries(entries, '2026-01'), [entries[0]])
  assert.deepEqual(filterLedgerEntries(entries, 'usd'), [entries[1]])
  assert.deepEqual(filterLedgerEntries(entries, 'not present'), [])
})
