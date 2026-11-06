import { describe, expect, it } from 'vitest'
import { compareValuations } from '../../src/server/investments/comparison'

const cost = { id: 'cost', investmentId: 'one', currency: 'UGX', amountMinor: 9007199254740991, valuationDate: '2026-01-01', basis: 'Reported cost', source: 'Ledger' }
const market = { id: 'market', investmentId: 'one', currency: 'UGX', amountMinor: 1, valuationDate: '2026-02-01', basis: 'Market estimate', source: 'Broker' }

describe('explicit value comparison', () => {
  it('retains each source and calculates exact signed difference in minor units', () => {
    expect(compareValuations(cost, market)).toEqual({ cost, market, differenceMinor: '-9007199254740990', direction: 'decrease' })
    expect(compareValuations(market, cost)?.differenceMinor).toBe('9007199254740990')
    expect(compareValuations({ ...market, id: 'other' }, market)?.direction).toBe('unchanged')
  })
  it('rejects missing, identical, different investment or different currency values', () => {
    expect(compareValuations(undefined, market)).toBeNull()
    expect(compareValuations(cost, cost)).toBeNull()
    expect(compareValuations(cost, { ...market, investmentId: 'two' })).toBeNull()
    expect(compareValuations(cost, { ...market, currency: 'USD' })).toBeNull()
  })
})
