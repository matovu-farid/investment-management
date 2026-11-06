import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { createBooking, createFulfilment, createRepayment, createLoan, listLending } from './service'

async function context() {
  const [{ env }, { auth }, { lendingRepository }] = await Promise.all([import('cloudflare:workers'), import('../../lib/auth'), import('./repository')])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return { repo: lendingRepository(env.DB), actor: session?.user.id ?? null }
}
export const listLendingFn = createServerFn({ method: 'GET' }).handler(async () => { const { repo, actor } = await context(); return listLending(repo, actor) })
export const createLoanFn = createServerFn({ method: 'POST' }).validator((data: unknown) => data).handler(async ({ data }) => { const { repo, actor } = await context(); return createLoan(repo, actor, data) })
export const createBookingFn = createServerFn({ method: 'POST' }).validator((data: unknown) => data).handler(async ({ data }) => { const { repo, actor } = await context(); return createBooking(repo, actor, data) })

export const createFulfilmentFn = createServerFn({ method: 'POST' }).validator((data: unknown) => data).handler(async ({ data }) => { const { repo, actor } = await context(); return createFulfilment(repo, actor, data) })

export const createRepaymentFn = createServerFn({ method: 'POST' }).validator((data: unknown) => data).handler(async ({ data }) => { const { repo, actor } = await context(); return createRepayment(repo, actor, data) })
