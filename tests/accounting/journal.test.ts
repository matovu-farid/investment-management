import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validateJournal } from '../../src/lib/accounting/journal.ts'

test('accepts a balanced loan disbursement in integer minor units', () => {
  assert.deepEqual(validateJournal([
    { accountId: 'loans-receivable', side: 'debit', amountMinor: 100000 },
    { accountId: 'cash', side: 'credit', amountMinor: 100000 },
  ]), { debitMinor: 100000, creditMinor: 100000 })
})

test('rejects an unbalanced journal', () => {
  assert.throws(() => validateJournal([
    { accountId: 'cash', side: 'debit', amountMinor: 100 },
    { accountId: 'income', side: 'credit', amountMinor: 99 },
  ]), /balance/i)
})

test('rejects invalid amounts, sides and accounts', () => {
  for (const invalid of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateJournal([
      { accountId: 'cash', side: 'debit', amountMinor: invalid },
      { accountId: 'income', side: 'credit', amountMinor: 100 },
    ]), /amount/i)
  }
  assert.throws(() => validateJournal([
    { accountId: ' ', side: 'debit', amountMinor: 100 },
    { accountId: 'income', side: 'credit', amountMinor: 100 },
  ]), /account/i)
  assert.throws(() => validateJournal([
    { accountId: 'cash', side: 'other' as 'debit', amountMinor: 100 },
    { accountId: 'income', side: 'credit', amountMinor: 100 },
  ]), /side/i)
})

test('rejects too few lines and totals beyond safe integer precision', () => {
  assert.throws(() => validateJournal([]), /two/i)
  assert.throws(() => validateJournal([
    { accountId: 'cash', side: 'debit', amountMinor: Number.MAX_SAFE_INTEGER },
    { accountId: 'cash', side: 'debit', amountMinor: 1 },
    { accountId: 'income', side: 'credit', amountMinor: Number.MAX_SAFE_INTEGER },
    { accountId: 'income', side: 'credit', amountMinor: 1 },
  ]), /safe/i)
})
