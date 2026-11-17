import { trialBalance } from '../trial-balance/service.ts'
import { calculatedLendingSummary } from '../board-packets/calculated-lending.ts'

type SourceDependencies = { trial: typeof trialBalance; lending: typeof calculatedLendingSummary }
type Input = { asOf: string; currency: string; cashAccountIds: string[]; includeLending: boolean }
const defaults: SourceDependencies = { trial: trialBalance, lending: calculatedLendingSummary }

/** Capture selected sources twice. This detects observed changes, not every possible intervening ABA change. */
export async function capturePortfolioSources(db: D1Database, actorId: string | null, input: Input, deps: SourceDependencies = defaults) {
  if (!actorId) throw new Error('Unauthorized')
  if (!input || typeof input.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf + 'T00:00:00Z')) || new Date(input.asOf + 'T00:00:00Z').toISOString().slice(0, 10) !== input.asOf) throw new Error('Invalid date')
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency) || !Array.isArray(input.cashAccountIds) || input.cashAccountIds.length > 500 || typeof input.includeLending !== 'boolean') throw new Error('Invalid selection')
  if (input.cashAccountIds.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 128)) throw new Error('Invalid account selection')
  if (new Set(input.cashAccountIds).size !== input.cashAccountIds.length) throw new Error('Duplicate account')
  const clock = await db.prepare("SELECT date('now','+3 hours') AS today").first<{ today: string }>()
  if (!clock || input.asOf > clock.today) throw new Error('Portfolio source date cannot be in the future')
  const capture = async () => {
    // trialBalance performs the administrator check, even when no cash accounts are selected.
    const trial = await deps.trial(db, actorId, input.asOf)
    const cash = input.cashAccountIds.map(id => {
      const account = trial.accounts.find(a => a.accountId === id)
      if (!account) throw new Error('Selected account unavailable')
      if (account.currency !== input.currency) throw new Error('Account currency mismatch')
      if (BigInt(account.netCredit) > 0n) throw new Error('Credit balance requires separate review')
      return account
    })
    const lending = input.includeLending ? await deps.lending(db, actorId, input.asOf) : null
    return { cash, lending }
  }
  const capturedFrom = new Date().toISOString()
  const first = await capture()
  const second = await capture()
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('Portfolio sources changed during capture; retry')
  return { asOf: input.asOf, currency: input.currency, capturedFrom, capturedTo: new Date().toISOString(), ...second }
}
