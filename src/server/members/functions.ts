import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { createMember, listMembers } from './service'

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

export const createMemberFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { repository, actorId } = await context()
    return createMember(repository, actorId, data)
  })
