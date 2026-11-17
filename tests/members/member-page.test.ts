import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { loadMemberPage } from '../../src/server/members/functions.ts'
import type { MemberRepository } from '../../src/server/members/service.ts'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'

test('member page distinguishes signed-out, unauthorized and available empty lists', async () => {
  let reads = 0
  let allowed = false
  const repository: MemberRepository = {
    roleFor: async () => { throw new Error('Unexpected role preflight') },
    list: async () => { reads++; if (!allowed) throw new Error('Unauthorized'); return [] },
    create: async member => member,
  }
  assert.deepEqual(await loadMemberPage(repository, null), { authenticated: false })
  assert.equal(reads, 0)
  assert.deepEqual(await loadMemberPage(repository, 'member'), { authenticated: true, members: [], available: false })
  allowed = true
  assert.deepEqual(await loadMemberPage(repository, 'admin'), { authenticated: true, members: [], available: true })
  assert.equal(reads, 2)
})

test('member page keeps a read failure distinct from a signed-out redirect', async () => {
  const repository: MemberRepository = { roleFor: async () => null, list: async () => { throw new Error('D1 unavailable') }, create: async member => member }
  assert.deepEqual(await loadMemberPage(repository, 'admin'), { authenticated: true, members: [], available: false })
})

test('member page reloads its guarded list after router invalidation', async () => {
  let reads = 0
  const repository: MemberRepository = { roleFor: async () => null, list: async () => { reads++; return [] }, create: async member => member }
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: '/members', beforeLoad: async () => {
    const data = await loadMemberPage(repository, 'admin')
    if (!data.authenticated) throw redirect({ to: '/login' })
    return { initialData: data }
  }, loader: ({ context }) => context.initialData })
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/members'] }), isServer: false })
  await router.load()
  assert.equal(reads, 1)
  await router.invalidate()
  assert.equal(reads, 2)
})

test('navigating back after access is revoked does not show cached member data', async () => {
  let allowed = true
  const member = { id: 'm', memberNumber: '1', fullName: 'Private member', email: null, status: 'active' as const, createdBy: 'admin' }
  const repository: MemberRepository = { roleFor: async () => null, list: async () => { if (!allowed) throw new Error('Unauthorized'); return [member] }, create: async value => value }
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: '/members', beforeLoad: async () => {
    const data = await loadMemberPage(repository, 'admin')
    if (!data.authenticated) throw redirect({ to: '/login' })
    return { initialData: data }
  }, loader: ({ context }) => context.initialData })
  const other = createRoute({ getParentRoute: () => root, path: '/other' })
  const history = createMemoryHistory({ initialEntries: ['/members'] })
  const router = createRouter({ routeTree: root.addChildren([route, other]), history, isServer: false })
  await router.load()
  assert.equal((router.state.matches.at(-1)?.loaderData as { members: unknown[] }).members.length, 1)
  history.push('/other'); await router.load()
  allowed = false
  history.push('/members'); await router.load()
  assert.deepEqual(router.state.matches.at(-1)?.loaderData, { authenticated: true, members: [], available: false })
})
