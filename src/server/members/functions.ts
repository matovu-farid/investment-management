import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, setResponseHeader } from '@tanstack/react-start/server'
import { createMember, listMembers, type MemberRepository } from './service.ts'

// Authentication and the role lookup happen on the server for every request.
async function context() {
  const [{ env }, { auth }, { createMemberRepository }] = await Promise.all([
    import('cloudflare:workers'), import('../../lib/auth'), import('./repository'),
  ])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return { actorId: session?.user.id ?? null, repository: createMemberRepository(env.DB) }
}

export const listMembersFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { repository, actorId } = await context()
  return listMembers(repository, actorId)
})

/** The repository's list operation performs its own guarded role check. */
export async function loadMemberPage(repository: MemberRepository, actorId: string | null) {
  if (!actorId) return { authenticated: false as const }
  try { return { authenticated: true as const, members: await listMembers(repository, actorId), available: true } }
  catch { return { authenticated: true as const, members: [], available: false } }
}

export const memberPageFn = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const { repository, actorId } = await context()
  return loadMemberPage(repository, actorId)
})

export const createMemberFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { repository, actorId } = await context()
    return createMember(repository, actorId, data)
  })
