import { csvCell } from '../report-export/export.ts'
import type { trialBalance } from '../../server/trial-balance/service.ts'

type TrialBalance = Awaited<ReturnType<typeof trialBalance>>

export function trialBalanceCaveat(asOf: string): string {
  return `Posted journal lines effective through ${asOf}, including reversals by their effective dates. This reflects records known now, including later backdated postings. The account list is current, including accounts with no activity; it is not a historical account register. Amounts are minor units. This is a ledger-derived trial balance, not an approved financial statement or a loan or cash balance.`
}

export function trialBalanceCsv(result: TrialBalance): string {
  const rows: string[][] = [
    ['RNIG trial balance'], ['As-of date', result.asOf], [trialBalanceCaveat(result.asOf)],
    ['Spreadsheet import: import columns as text to preserve dates, account codes and large amounts. Protective apostrophes may appear.'],
    [], ['Accounts'], ['Account code', 'Name', 'Currency', 'Debits (minor units)', 'Credits (minor units)', 'Net debit (minor units)', 'Net credit (minor units)'],
    ...result.accounts.map(a => [a.code, a.name, a.currency, a.debits, a.credits, a.netDebit, a.netCredit]),
    [], ['Totals by currency'], ['Currency', 'Debits (minor units)', 'Credits (minor units)', 'Net debit (minor units)', 'Net credit (minor units)'],
    ...result.totals.map(t => [t.currency, t.debits, t.credits, t.netDebit, t.netCredit]),
  ]
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
