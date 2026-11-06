import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { createJointHolding, createShareEvent, listShares } from './service'
async function context() { const [{ env }, { auth }, { createSharesRepository }] = await Promise.all([import('cloudflare:workers'), import('../../lib/auth'), import('./repository')]); const session = await auth.api.getSession({ headers: getRequestHeaders() }); return { repo: createSharesRepository(env.DB), actor: session?.user.id ?? null } }
export const listSharesFn = createServerFn({ method: 'GET' }).handler(async () => { const {repo,actor} = await context(); return listShares(repo,actor) })
export const createShareEventFn = createServerFn({ method: 'POST' }).validator((input: unknown) => input).handler(async ({data}) => { const {repo,actor} = await context(); return createShareEvent(repo,actor,data) })
export const createJointHoldingFn = createServerFn({ method: 'POST' }).validator((input: unknown) => input).handler(async ({data}) => { const {repo,actor} = await context(); return createJointHolding(repo,actor,data) })
