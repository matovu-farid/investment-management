import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listInstallmentPlans, saveInstallmentPlan, getInstallmentTracking } from './service'

async function context() {
  const [{ env }, { auth }] = await Promise.all([import('cloudflare:workers'), import('../../lib/auth')])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return { db: env.DB, actorId: session?.user.id ?? null }
}

export const listInstallmentPlansFn = createServerFn({ method: 'POST' }).validator((value: { loanId: string }) => value).handler(async ({ data }) => {
  const { db, actorId } = await context()
  return listInstallmentPlans(db, actorId, data.loanId)
})
export const saveInstallmentPlanFn = createServerFn({ method: 'POST' }).validator((value: unknown) => value).handler(async ({ data }) => {
  const { db, actorId } = await context()
  return saveInstallmentPlan(db, actorId, data)
})
export const getInstallmentTrackingFn = createServerFn({ method: 'POST' }).validator((value: { loanId: string; asOfDate: string }) => value).handler(async ({ data }) => {
  const { db, actorId } = await context()
  return getInstallmentTracking(db, actorId, data)
})
