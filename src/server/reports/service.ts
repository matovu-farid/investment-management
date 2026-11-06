export type Fact = Record<string, string | number | null>
export type Report = { start: string; end: string; members: Fact[]; loans: Fact[]; repayments: Fact[]; bookings: Fact[]; bookingSnapshot: Fact[]; bookingSnapshotTotals: Fact[]; bookingStatusEvents: Fact[]; fulfilments: Fact[]; investments: Fact[]; transactions: Fact[]; valuations: Fact[]; shareEvents: Fact[]; shareTrades: Fact[]; cashEntries?: Fact[] }
export interface ReportRepository { roleFor(userId: string): Promise<string | null>; forPeriod(start: string, end: string): Promise<Report> }
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export async function reportForPeriod(repo: ReportRepository, actorId: string | null, input: unknown): Promise<Report> {
  if (!actorId || await repo.roleFor(actorId) !== 'admin') throw new Error('Unauthorized')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid period')
  const { start, end } = input as Record<string, unknown>
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Invalid period')
  return repo.forPeriod(start, end)
}
