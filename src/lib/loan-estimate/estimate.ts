export type LoanInterestEstimateInput = {
  principalMinor: string
  startDate: string
  asOfDate: string
  rateBasisPoints: number
  periodDays: number
  principalReductions: { date: string; amountMinor: string }[]
  rounding: 'down' | 'half-up'
}

const DAY_MS = 86_400_000

function day(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid date')
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Enter a valid date')
  return date.getTime() / DAY_MS
}

function minor(value: string, name: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || value.length > 30) throw new Error(`Enter a valid ${name} in minor units`)
  return BigInt(value)
}

/** Indicative simple-interest calculation, never an authoritative loan balance. */
export function estimateLoanInterest(input: LoanInterestEstimateInput): { interestMinor: string; principalMinor: string; elapsedDays: number } {
  const start = day(input.startDate), end = day(input.asOfDate)
  if (end < start) throw new Error('As-of date cannot precede the start date')
  if (!Number.isSafeInteger(input.rateBasisPoints) || input.rateBasisPoints < 0 || input.rateBasisPoints > 10000) throw new Error('Enter a rate from 0 to 10000 basis points')
  if (!Number.isSafeInteger(input.periodDays) || input.periodDays < 1 || input.periodDays > 3660) throw new Error('Enter a period from 1 to 3660 days')
  if (input.rounding !== 'down' && input.rounding !== 'half-up') throw new Error('Choose a rounding method')
  if (!Array.isArray(input.principalReductions) || input.principalReductions.length > 1000) throw new Error('Invalid principal reductions')
  let principal = minor(input.principalMinor, 'principal')
  if (principal === 0n) throw new Error('Principal must be positive')
  const reductions = input.principalReductions.map(r => ({ date: day(r.date), amount: minor(r.amountMinor, 'principal reduction') })).sort((a,b) => a.date-b.date)
  let cursor = start, weighted = 0n
  for (const reduction of reductions) {
    if (reduction.date < start || reduction.date > end) throw new Error('Principal reduction must fall within the estimate period')
    if (reduction.amount === 0n || reduction.amount > principal) throw new Error('Principal reduction must be positive and not exceed the remaining principal')
    weighted += principal * BigInt(reduction.date - cursor)
    principal -= reduction.amount
    cursor = reduction.date
  }
  weighted += principal * BigInt(end - cursor)
  const numerator = weighted * BigInt(input.rateBasisPoints), denominator = BigInt(input.periodDays) * 10000n
  const interest = input.rounding === 'half-up' ? (numerator + denominator / 2n) / denominator : numerator / denominator
  return {interestMinor: String(interest), principalMinor: String(principal), elapsedDays: end-start}
}
