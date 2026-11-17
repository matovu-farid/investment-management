import { calculateAllocation, type Dataset } from './calculate.ts'

/** A balance supplied by an authorized, dated source snapshot, not user-entered evidence. */
export type PortfolioBalance = {
  kind: 'cash' | 'lending'
  id: string
  name: string
  assetClass: string
  currency: string
  asOf: string
  amountMinor: string
  source: string
}

/** Combines reviewed sources; callers must independently establish source authenticity and overlap. */
export function calculatePortfolioAllocation(data: Dataset, currency: string, asOf: string, selected: Record<string, string>, mappings: Record<string, string>, zeroPolicyIds: string[], balances: PortfolioBalance[]) {
  if (!Array.isArray(balances) || balances.length > 500) throw new Error('Invalid balance selection')
  const sourceKeys = new Set<string>()
  let lendingCount = 0
  const investments = [...data.investments]
  const valuations = [...data.valuations]
  const choices = { ...selected }
  const syntheticIds = new Set<string>()
  for (const [index, balance] of balances.entries()) {
    if (!balance || (balance.kind !== 'cash' && balance.kind !== 'lending') || typeof balance.id !== 'string' || !balance.id.trim() || typeof balance.name !== 'string' || !balance.name.trim() || typeof balance.assetClass !== 'string' || !balance.assetClass.trim() || typeof balance.source !== 'string' || !balance.source.trim()) throw new Error('Invalid source')
    const key = JSON.stringify([balance.kind, balance.id])
    if (sourceKeys.has(key)) throw new Error('Duplicate source')
    sourceKeys.add(key)
    if (balance.kind === 'lending' && ++lendingCount > 1) throw new Error('Choose one lending basis')
    if (balance.currency !== currency) throw new Error('Source currency mismatch')
    if (balance.asOf !== asOf) throw new Error('Source date must match the comparison date')
    if (!/^(0|[1-9]\d{0,29})$/.test(balance.amountMinor)) throw new Error('Invalid source amount')
    let investmentId = `__portfolio_balance_${index}`
    while (investments.some(i => i.id === investmentId) || Object.hasOwn(choices, investmentId)) investmentId += '_'
    let valuationId = `__portfolio_value_${index}`
    while (valuations.some(v => v.id === valuationId)) valuationId += '_'
    syntheticIds.add(investmentId)
    investments.push({ id: investmentId, name: balance.name, assetClass: balance.assetClass, currency, status: 'reviewed balance' })
    valuations.push({ id: valuationId, investmentId, valuationDate: asOf, amountMinor: balance.amountMinor, currency, basis: balance.kind, source: balance.source })
    choices[investmentId] = valuationId
  }
  const result = calculateAllocation({ ...data, investments, valuations }, currency, asOf, choices, mappings, zeroPolicyIds)
  return { ...result, selected: result.selected.filter(v => !syntheticIds.has(v.investmentId)), supplementalSources: balances.map(b => ({ ...b })) }
}
