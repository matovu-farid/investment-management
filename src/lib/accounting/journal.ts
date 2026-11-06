/** A journal line is expressed in the currency's smallest unit, never a float. */
export type JournalLine = {
  accountId: string
  side: 'debit' | 'credit'
  amountMinor: number
}

export type JournalTotals = {
  debitMinor: number
  creditMinor: number
}

/**
 * Check a journal before posting. Persistence must also atomically write all
 * lines and enforce account existence, currency, authorization and idempotency.
 */
export function validateJournal(lines: readonly JournalLine[]): JournalTotals {
  if (lines.length < 2) throw new Error('A journal requires at least two lines')

  let debitMinor = 0
  let creditMinor = 0
  for (const line of lines) {
    if (typeof line.accountId !== 'string' || !line.accountId.trim()) {
      throw new Error('Each journal line requires an account')
    }
    if (line.side !== 'debit' && line.side !== 'credit') {
      throw new Error('Each journal line requires a valid side')
    }
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) {
      throw new Error('Each amount must be a positive safe integer in minor units')
    }
    if (line.side === 'debit') debitMinor += line.amountMinor
    else creditMinor += line.amountMinor
    if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) {
      throw new Error('Journal totals must remain safe integers')
    }
  }
  if (debitMinor !== creditMinor) throw new Error('Journal must balance')
  return { debitMinor, creditMinor }
}
