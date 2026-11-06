export type Loan = { id: string; memberId: string; principalMinor: number; currency: string; disbursementDate: string; maturityDate: string | null; terms: string; createdBy: string; memberName?: string; voidedAt?: string | null; voidReason?: string | null }
export type Booking = { id: string; memberId: string; requestedMinor: number; currency: string; requestedDate: string; status: 'waiting' | 'held' | 'closed' | 'cancelled'; createdBy: string; memberName?: string; fulfilledMinor?: number; sourceRef?: string | null; notes?: string | null }
export type Fulfilment = { id: string; bookingId: string; amountMinor: number; fulfilmentDate: string; createdBy: string; bookingSourceRef?: string | null; sourceRef?: string | null; voidedAt?: string | null; voidReason?: string | null }
export type Repayment = { id: string; loanId: string; paymentDate: string; amountMinor: number; reference: string | null; notes: string | null; createdBy: string; voidedAt?: string | null; voidReason?: string | null }
export interface LendingRepository {
  roleFor(userId: string): Promise<string | null>
  memberIsActive(id: string): Promise<boolean>
  loanDate(id: string): Promise<string | null>
  bookingDate(id: string): Promise<string | null>
  list(): Promise<{ loans: Loan[]; bookings: Booking[]; fulfilments: Fulfilment[]; repayments: Repayment[] }>
  createLoan(loan: Loan, idempotencyKey: string): Promise<Loan>
  createBooking(booking: Booking, idempotencyKey: string): Promise<Booking>
  createRepayment(repayment: Repayment, idempotencyKey: string): Promise<Repayment>
  createFulfilment(fulfilment: Fulfilment, idempotencyKey: string): Promise<Fulfilment>
}
async function authorize(repo: LendingRepository, actor: string | null): Promise<string> {
  if (!actor || await repo.roleFor(actor) !== 'admin') throw new Error('Unauthorized')
  return actor
}
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid input')
  return input as Record<string, unknown>
}
function required(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Invalid input')
  return value.trim()
}
function date(value: unknown): string {
  const s = required(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new Error('Invalid date')
  return s
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid amount')
  return value
}
function currency(value: unknown): string {
  const s = required(value, 3)
  if (!/^[A-Z]{3}$/.test(s)) throw new Error('Invalid currency')
  return s
}
function requestKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid request key')
  return value.toLowerCase()
}
async function activeMember(repo: LendingRepository, value: unknown): Promise<string> {
  const id = required(value, 100)
  if (!await repo.memberIsActive(id)) throw new Error('Invalid member')
  return id
}
export async function listLending(repo: LendingRepository, actor: string | null) {
  await authorize(repo, actor)
  return repo.list()
}
export async function createLoan(repo: LendingRepository, actor: string | null, input: unknown): Promise<Loan> {
  const createdBy = await authorize(repo, actor)
  const v = record(input)
  const idempotencyKey = requestKey(v.idempotencyKey)
  const memberId = await activeMember(repo, v.memberId)
  const principalMinor = amount(v.principalMinor)
  const unit = currency(v.currency)
  const disbursementDate = date(v.disbursementDate)
  const maturityDate = v.maturityDate ? date(v.maturityDate) : null
  if (maturityDate && maturityDate < disbursementDate) throw new Error('Invalid maturity date')
  const terms = required(v.terms, 4000)
  return repo.createLoan({ id: crypto.randomUUID(), memberId, principalMinor, currency: unit, disbursementDate, maturityDate, terms, createdBy }, idempotencyKey)
}
export async function createBooking(repo: LendingRepository, actor: string | null, input: unknown): Promise<Booking> {
  const createdBy = await authorize(repo, actor)
  const v = record(input)
  const idempotencyKey = requestKey(v.idempotencyKey)
  const memberId = await activeMember(repo, v.memberId)
  return repo.createBooking({ id: crypto.randomUUID(), memberId, requestedMinor: amount(v.requestedMinor), currency: currency(v.currency), requestedDate: date(v.requestedDate), status: 'waiting', createdBy }, idempotencyKey)
}

export async function createFulfilment(repo: LendingRepository, actor: string | null, input: unknown): Promise<Fulfilment> {
  const createdBy = await authorize(repo, actor)
  const v = record(input)
  const key = requestKey(v.idempotencyKey)
  const bookingId = required(v.bookingId, 100), fulfilmentDate = date(v.fulfilmentDate)
  const requestedDate = await repo.bookingDate(bookingId)
  if (!requestedDate || fulfilmentDate < requestedDate) throw new Error('Invalid fulfilment date or booking')
  return repo.createFulfilment({ id: crypto.randomUUID(), bookingId, amountMinor: amount(v.amountMinor), fulfilmentDate, createdBy }, key)
}

function optional(value: unknown, max: number): string | null {
  if (value == null || value === '') return null
  return required(value, max)
}
export async function createRepayment(repo: LendingRepository, actor: string | null, input: unknown): Promise<Repayment> {
  const createdBy = await authorize(repo, actor), v = record(input), key = requestKey(v.idempotencyKey)
  const loanId = required(v.loanId, 100), paymentDate = date(v.paymentDate), amountMinor = amount(v.amountMinor)
  const disbursementDate = await repo.loanDate(loanId)
  if (!disbursementDate || paymentDate < disbursementDate) throw new Error('Invalid repayment date or loan')
  return repo.createRepayment({ id: crypto.randomUUID(), loanId, paymentDate, amountMinor, reference: optional(v.reference, 200), notes: optional(v.notes, 2000), createdBy }, key)
}
