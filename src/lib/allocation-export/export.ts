import { csvCell } from '../report-export/export.ts'
import type { calculateAllocation } from '../../server/allocation/calculate.ts'

type Allocation = ReturnType<typeof calculateAllocation>

export function allocationCsv(result: Allocation): string {
  const rows: (string | number | null | undefined)[][] = [
    ['RNIG portfolio allocation worksheet'],
    ['Data snapshot (UTC)',result.snapshotAt], ['As-of date', result.asOf], ['Currency', result.currency], ['Selected total (minor units)', result.total],
    ['Indicative comparison of the selected subset, not a complete portfolio valuation or a compliance determination. No currency conversion, valuation selection or policy classification is inferred.'],
    ['All investment records include closed investments; excluded records do not contribute to the denominator. Observations are dated on or before the as-of date. Different observation dates and bases may not be comparable.'],
    ['Data snapshot is the UTC time the database records were read. The as-of date filters effective dates; it does not reconstruct what was known then. Later changes may not be reflected.'],
    ['Allocation percentages are rounded to two decimals for display; comparisons with selected policy ranges use exact values.'],
    ['Spreadsheet import: import columns as text to preserve dates, identifiers and large amounts. Protective apostrophes may appear.'],
    [], ['Selected allocation by recorded class'],
    ['Recorded class','Amount (minor units)','Currency','Allocation (basis points, rounded)','Comparison','Selected policy ID','Selected policy class','Policy effective date','Minimum (basis points)','Maximum (basis points)','Target (basis points)','Policy source'],
    ...result.classes.map(c => [c.assetClass,c.amountMinor,result.currency,c.basisPoints,c.comparison,c.policy?.id,c.policy?.assetClass,c.policy?.effectiveDate,c.policy?.minBasisPoints,c.policy?.maxBasisPoints,c.policy?.targetBasisPoints,c.policy?.source]),
    [], ['Selected observations'],
    ['Investment ID','Investment','Recorded class','Valuation ID','Valuation date','Amount (minor units)','Currency','Basis','Source'],
    ...result.selected.map(v => [v.investmentId,v.name,v.assetClass,v.id,v.valuationDate,v.amountMinor,v.currency,v.basis,v.source]),
    [], ['Excluded investments'], ['Investment ID','Investment','Recorded class','Currency','Current status'],
    ...result.excluded.map(i => [i.id,i.name,i.assetClass,i.currency,i.status]),
  ]
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
