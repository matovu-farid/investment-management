import { describe, expect, it, vi } from 'vitest'
import { addInvestment, addValuation, addTransaction, listInvestments } from '../../src/server/investments/service'
import type { InvestmentRepository } from '../../src/server/investments/service'

function repository(role: string | null = 'admin'): InvestmentRepository {
  return { roleFor: vi.fn(async () => role), list: vi.fn(async () => []), create: vi.fn(async investment => investment), addValuation: vi.fn(async valuation => valuation), addTransaction: vi.fn(async transaction => transaction), find: vi.fn(async () => ({ id: 'i', name: 'Bond', assetClass: 'Bonds', currency: 'UGX', status: 'active', createdBy: 'a' })) }
}
describe('investment register', () => {
  it('rejects unauthenticated or non-admin read and writes', async () => {
    const repo = repository('member')
    await expect(listInvestments(repo, null)).rejects.toThrow('Unauthorized')
    await expect(addInvestment(repo, 'm', { name: 'Bond', assetClass: 'Bonds', currency: 'UGX', requestKey: '123e4567-e89b-42d3-a456-426614174000' })).rejects.toThrow('Unauthorized')
    await expect(addValuation(repo, 'm', {})).rejects.toThrow('Unauthorized')
    expect(repo.list).not.toHaveBeenCalled(); expect(repo.create).not.toHaveBeenCalled(); expect(repo.addValuation).not.toHaveBeenCalled()
  })
  it('stores trimmed investment facts and authenticated creator', async () => {
    const repo = repository()
    const item = await addInvestment(repo, 'a', { name: ' Bond ', assetClass: ' Bonds ', currency: 'UGX', requestKey: '123e4567-e89b-42d3-a456-426614174000' })
    expect(item).toMatchObject({ name: 'Bond', assetClass: 'Bonds', currency: 'UGX', createdBy: 'a' })
  })
  it('rejects bad currency, dates, amounts and unknown investment', async () => {
    const repo = repository()
    await expect(addInvestment(repo, 'a', { name: 'Bond', assetClass: 'Bonds', currency: 'ugx', requestKey: '123e4567-e89b-42d3-a456-426614174000' })).rejects.toThrow()
    for (const data of [
      { investmentId: 'i', valuationDate: '2026-02-30', amountMinor: '2', basis: 'Market', requestKey: '123e4567-e89b-42d3-a456-426614174000' },
      { investmentId: 'i', valuationDate: '2026-02-01', amountMinor: '1.2', basis: 'Market', requestKey: '123e4567-e89b-42d3-a456-426614174000' },
      { investmentId: 'i', valuationDate: '2026-02-01', amountMinor: '9007199254740992', basis: 'Market', requestKey: '123e4567-e89b-42d3-a456-426614174000' },
      { investmentId: 'i', valuationDate: '2026-02-01', amountMinor: '-1', basis: 'Market', requestKey: '123e4567-e89b-42d3-a456-426614174000' },
    ]) await expect(addValuation(repo, 'a', data)).rejects.toThrow()
    vi.mocked(repo.find).mockResolvedValueOnce(null)
    await expect(addValuation(repo, 'a', { investmentId: 'missing', valuationDate: '2026-02-01', amountMinor: '2', basis: 'Market', requestKey: '123e4567-e89b-42d3-a456-426614174000' })).rejects.toThrow()
    expect(repo.addValuation).not.toHaveBeenCalled()
  })
  it('uses the investment currency for a dated valuation', async () => {
    const repo = repository()
    expect(await addValuation(repo, 'a', { investmentId: 'i', valuationDate: '2026-02-01', amountMinor: '0', basis: ' Market ', source: ' Statement ', requestKey: '123e4567-e89b-42d3-a456-426614174000' })).toMatchObject({ amountMinor: 0, currency: 'UGX', basis: 'Market', source: 'Statement', createdBy: 'a' })
  })
})
it('requires a stable request key for each mutation', async () => {
  const repo = repository()
  await expect(addInvestment(repo, 'a', { name: 'Bond', assetClass: 'Bonds', currency: 'UGX' })).rejects.toThrow('request key')
  await expect(addValuation(repo, 'a', { investmentId: 'i', valuationDate: '2026-02-01', amountMinor: '2', basis: 'Market' })).rejects.toThrow('request key')
})

it('validates and authorizes transaction facts', async () => {
  const input = { investmentId: 'i', transactionDate: '2026-11-05', transactionType: 'Dividend', amountMinor: '120', reference: 'Statement', notes: '', requestKey: '123e4567-e89b-42d3-a456-426614174000' }
  const repo = repository()
  await expect(addTransaction(repository('member'), 'm', input)).rejects.toThrow('Unauthorized')
  for (const changes of [{transactionDate:'2026-02-30'}, {amountMinor:'0'}, {amountMinor:'1.2'}, {transactionType:''}, {requestKey:'bad'}]) await expect(addTransaction(repo, 'a', {...input,...changes})).rejects.toThrow()
  expect(repo.addTransaction).not.toHaveBeenCalled()
  expect(await addTransaction(repo, 'a', input)).toMatchObject({ investmentId:'i', transactionType:'Dividend', amountMinor:120, createdBy:'a' })
})
