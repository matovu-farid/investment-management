export type Investment = { id: string; name: string; assetClass: string; currency: string; status: string; createdBy: string; sourceRef?: string | null }
export type Valuation = { id: string; investmentId: string; valuationDate: string; amountMinor: number; currency: string; basis: string; source: string | null; notes?: string | null; sourceRef?: string | null; createdBy: string; voidedAt?: string | null; voidReason?: string | null }
export type InvestmentTransaction = { id: string; investmentId: string; transactionDate: string; transactionType: string; amountMinor: number; reference: string | null; notes: string | null; sourceRef?: string | null; createdBy: string; voidedAt?: string | null; voidReason?: string | null }
export type InvestmentWithValuations = Investment & { valuations: Valuation[]; transactions: InvestmentTransaction[] }
export interface InvestmentRepository {
  roleFor(userId: string): Promise<string | null>
  list(actorId: string): Promise<InvestmentWithValuations[]>
  find(id: string, actorId: string): Promise<Investment | null>
  create(investment: Investment, requestKey: string): Promise<Investment>
  addValuation(valuation: Valuation, requestKey: string): Promise<Valuation>
  addTransaction(transaction: InvestmentTransaction, requestKey: string): Promise<InvestmentTransaction>
}
async function requireAdmin(repo: InvestmentRepository, actorId: string | null): Promise<string> {
  if (!actorId || await repo.roleFor(actorId) !== 'admin') throw new Error('Unauthorized')
  return actorId
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid input')
  return input as Record<string, unknown>
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Invalid input')
  return value.trim()
}
function requestKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid request key')
  return value.toLowerCase()
}
export async function listInvestments(repo: InvestmentRepository, actorId: string | null) {
  const actor = await requireAdmin(repo, actorId)
  return repo.list(actor)
}
export async function addInvestment(repo: InvestmentRepository, actorId: string | null, input: unknown) {
  const createdBy = await requireAdmin(repo, actorId)
  const data = object(input)
  const currency = text(data.currency, 3)
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency')
  return repo.create({ id: crypto.randomUUID(), name: text(data.name, 200), assetClass: text(data.assetClass, 100), currency, status: 'active', createdBy }, requestKey(data.requestKey))
}
export async function addValuation(repo: InvestmentRepository, actorId: string | null, input: unknown) {
  const createdBy = await requireAdmin(repo, actorId)
  const data = object(input)
  const investmentId = text(data.investmentId, 100)
  const valuationDate = text(data.valuationDate, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate) || !Number.isFinite(Date.parse(`${valuationDate}T00:00:00Z`)) || new Date(`${valuationDate}T00:00:00Z`).toISOString().slice(0, 10) !== valuationDate) throw new Error('Invalid date')
  const raw = text(data.amountMinor, 16)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Invalid amount')
  const basis = text(data.basis, 200)
  const source = data.source == null || data.source === '' ? null : text(data.source, 200)
  const investment = await repo.find(investmentId, createdBy)
  if (!investment) throw new Error('Investment not found')
  return repo.addValuation({ id: crypto.randomUUID(), investmentId, valuationDate, amountMinor: Number(raw), currency: investment.currency, basis, source, createdBy }, requestKey(data.requestKey))
}

export async function addTransaction(repo: InvestmentRepository, actorId: string | null, input: unknown) {
  const createdBy = await requireAdmin(repo, actorId), data = object(input)
  const investmentId = text(data.investmentId, 100), transactionDate = text(data.transactionDate, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !Number.isFinite(Date.parse(`${transactionDate}T00:00:00Z`)) || new Date(`${transactionDate}T00:00:00Z`).toISOString().slice(0, 10) !== transactionDate) throw new Error('Invalid date')
  const raw = text(data.amountMinor, 16)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) <= 0) throw new Error('Invalid amount')
  const transactionType = text(data.transactionType, 100), reference = data.reference == null || data.reference === '' ? null : text(data.reference, 200), notes = data.notes == null || data.notes === '' ? null : text(data.notes, 2000), key = requestKey(data.requestKey)
  if (!await repo.find(investmentId, createdBy)) throw new Error('Investment not found')
  return repo.addTransaction({ id: crypto.randomUUID(), investmentId, transactionDate, transactionType, amountMinor: Number(raw), reference, notes, createdBy }, key)
}
