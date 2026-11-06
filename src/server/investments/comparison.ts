/** Compare explicitly selected observations, without assigning accounting meaning. */
export type ComparableValuation = { id: string; investmentId: string; currency: string; amountMinor: number; valuationDate: string; basis: string; source: string | null }
export function compareValuations<T extends ComparableValuation>(cost: T | undefined, market: T | undefined) {
  if (!cost || !market || cost.id === market.id || cost.investmentId !== market.investmentId || cost.currency !== market.currency || !Number.isSafeInteger(cost.amountMinor) || !Number.isSafeInteger(market.amountMinor)) return null
  const difference = BigInt(market.amountMinor) - BigInt(cost.amountMinor)
  return { cost, market, differenceMinor: difference.toString(), direction: difference > 0n ? 'increase' : difference < 0n ? 'decrease' : 'unchanged' }
}
