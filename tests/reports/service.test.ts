import { describe, it, expect, vi } from 'vitest'
import { reportForPeriod } from '../../src/server/reports/service'
import type { ReportRepository } from '../../src/server/reports/service'
function repo(role: string | null = 'admin'): ReportRepository {
  return { roleFor: vi.fn(async () => role), forPeriod: vi.fn(async (start, end) => ({ start, end, members: [], loans: [], repayments: [], bookings: [], bookingSnapshot: [], bookingSnapshotTotals: [], bookingStatusEvents: [], fulfilments: [], investments: [], transactions: [], valuations: [], shareEvents: [], shareTrades: [] })) }
}
describe('period overview', () => {
  it('requires an authenticated administrator before querying', async () => {
    const r = repo('member')
    await expect(reportForPeriod(r, null, { start: '2026-01-01', end: '2026-04-30' })).rejects.toThrow('Unauthorized')
    await expect(reportForPeriod(r, 'member', { start: '2026-01-01', end: '2026-04-30' })).rejects.toThrow('Unauthorized')
    expect(r.forPeriod).not.toHaveBeenCalled()
  })
  it('rejects malformed dates and periods before querying', async () => {
    const r = repo()
    for (const period of [null, {}, { start: '2026-02-30', end: '2026-03-01' }, { start: '2026-2-1', end: '2026-03-01' }, { start: '2026-05-01', end: '2026-04-30' }])
      await expect(reportForPeriod(r, 'admin', period)).rejects.toThrow('Invalid period')
    expect(r.forPeriod).not.toHaveBeenCalled()
  })
  it('passes a valid inclusive four-month period to the repository', async () => {
    const r = repo()
    expect(await reportForPeriod(r, 'admin', { start: '2026-01-01', end: '2026-04-30' })).toMatchObject({ start: '2026-01-01', end: '2026-04-30' })
    expect(r.forPeriod).toHaveBeenCalledWith('2026-01-01', '2026-04-30')
  })
})
