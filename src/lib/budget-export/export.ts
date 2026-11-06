import { csvCell } from '../report-export/export.ts'
import type { compareBudget } from '../../server/budgets/service.ts'

type CurrentBudgetComparison = Awaited<ReturnType<typeof compareBudget>>
// Previously captured board packets do not carry the basis; they used investments.
type BudgetComparison = Omit<CurrentBudgetComparison,'comparisonBasis'> & Partial<Pick<CurrentBudgetComparison,'comparisonBasis'>>

export function budgetComparisonBasisLabel(basis:BudgetComparison['comparisonBasis']):string {
 switch(basis){case 'cash_receipts':return 'Cash receipts';case 'cash_payments':return 'Cash payments';default:return 'Investment transactions'}
}

/** Interpretation applies to both the on-screen worksheet and its export. */
export function budgetComparisonCaveats(): string[] {
 return [
  'Amounts are recorded as positive values. The comparison uses only the chosen basis: investment transactions, cash receipts, or cash payments. No income or expense sign, category match, currency conversion or accounting treatment is inferred. Unselected records and journal entries are excluded. The difference is selected amounts less the budget amount; it is not necessarily a financial variance.',
  'Based on records and budget status when the comparison was generated. A later void or other change may make this view stale; generate it again before use.',
  'When no records are selected for the chosen basis, a selected total of zero does not establish that actual activity was zero.',
  'Cash receipts and payments are shown separately when captured. Cash records may overlap with investment records; no combined total or category match is inferred.',
  'Spreadsheet import: import columns as text to preserve dates, identifiers, leading zeroes and large amounts. Protective apostrophes may appear.',
 ]
}

export function budgetComparisonCsv(result: BudgetComparison): string {
 const b=result.budget
 const rows:(string|null)[][]=[
  ['RNIG budget comparison worksheet'], ['Data snapshot (UTC)',result.snapshotAt],
  ...budgetComparisonCaveats().map(c=>[c]),
  [], ['Selected budget'],
  ['Budget ID','Category','Period start','Period end','Currency','Budget amount (minor units)','Source or approval reference'],
  [b.id,b.category,b.periodStart,b.periodEnd,b.currency,b.amountMinor,b.source],
  [], ['Comparison'], ['Comparison basis',budgetComparisonBasisLabel(result.comparisonBasis)], ['Currency','Selected amount (minor units)','Difference: selected less budget (minor units)'],
  [b.currency,result.selectedTotal,result.difference],
  [], ['Selected transactions'], ['Transaction ID','Investment','Date','Type','Currency','Amount (minor units)','Reference'],
  ...result.selected.map(t=>[t.id,t.investment,t.transactionDate,t.type,t.currency,t.amountMinor,t.reference]),
  [], ['Excluded investment transactions'], ['Transaction ID','Investment','Date','Type','Currency','Amount (minor units)','Reference'],
  ...result.excluded.map(t=>[t.id,t.investment,t.transactionDate,t.type,t.currency,t.amountMinor,t.reference]),
  ...(result.cash ? [
   [], ['Cash receipts and payments'], ['Currency','Selected receipts (minor units)','Selected payments (minor units)'],
   [b.currency,result.cash.receiptsTotal,result.cash.paymentsTotal],
   [], ['Selected cash records'], ['Record ID','Date','Direction','Currency','Amount (minor units)','Counterparty','Reference','Description'],
   ...result.cash.selected.map(c=>[c.id,c.entryDate,c.direction,c.currency,c.amountMinor,c.counterparty,c.reference,c.description]),
   [], ['Excluded cash records'], ['Record ID','Date','Direction','Currency','Amount (minor units)','Counterparty','Reference','Description'],
   ...result.cash.excluded.map(c=>[c.id,c.entryDate,c.direction,c.currency,c.amountMinor,c.counterparty,c.reference,c.description]),
  ] : [[], ['Cash activity not captured in this comparison']]),
 ]
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
