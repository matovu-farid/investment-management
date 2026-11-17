type Row = { dueDate: string; principalMinor: string; interestMinor: string }
type Opening = { openingDate: string; principalMinor: string; interestDueMinor: string }

/** Validate coverage and completeness after the row dates and amounts have been parsed. */
export function validateScheduleCoverage(input: { historyComplete: boolean; coverageStart: string; disbursementDate: string; originalPrincipalMinor: string; opening: Opening | null; rows: Row[] }): string | null {
  const { historyComplete, coverageStart, disbursementDate, originalPrincipalMinor, opening, rows } = input
  const baseline = opening?.openingDate ?? disbursementDate
  if (coverageStart < baseline || rows.some(row => row.dueDate < disbursementDate) || (historyComplete && coverageStart !== baseline)) return 'Review coverage from the loan or opening date; complete history must start at that date.'
  if (!historyComplete) return null
  const principal = rows.reduce((sum, row) => sum + BigInt(row.principalMinor), 0n)
  const interest = rows.reduce((sum, row) => sum + BigInt(row.interestMinor), 0n)
  if (principal !== BigInt(opening?.principalMinor ?? originalPrincipalMinor) || (opening && interest < BigInt(opening.interestDueMinor))) return 'A complete schedule must cover the full original or opening principal and any unpaid opening interest.'
  return null
}
