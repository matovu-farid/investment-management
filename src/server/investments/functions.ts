import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { addInvestment, addValuation, addTransaction, listInvestments } from './service'
async function context() {
  const [{ env }, { auth }, { createInvestmentRepository }] = await Promise.all([import('cloudflare:workers'), import('../../lib/auth'), import('./repository')])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return { actorId: session?.user.id ?? null, repository: createInvestmentRepository(env.DB) }
}
export const listInvestmentsFn = createServerFn({ method: 'GET' }).handler(async () => { const { repository, actorId } = await context(); return listInvestments(repository, actorId) })
export const createInvestmentFn = createServerFn({ method: 'POST' }).validator((input: unknown) => input).handler(async ({ data }) => { const { repository, actorId } = await context(); return addInvestment(repository, actorId, data) })
export const createValuationFn = createServerFn({ method: 'POST' }).validator((input: unknown) => input).handler(async ({ data }) => { const { repository, actorId } = await context(); return addValuation(repository, actorId, data) })

export const createTransactionFn = createServerFn({ method: 'POST' }).validator((input: unknown) => input).handler(async ({ data }) => { const { repository, actorId } = await context(); return addTransaction(repository, actorId, data) })
