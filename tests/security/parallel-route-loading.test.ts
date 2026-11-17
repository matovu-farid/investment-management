import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { loadAuthenticated, loadRouteInParallel } from '../../src/lib/parallel-route-loading.ts'

test('starts a protected data request while the independent session check is pending', async () => {
  let resolveSession!: (value: { user: { id: string } }) => void
  const session = new Promise<{ user: { id: string } }>(resolve => { resolveSession = resolve })
  let started = false
  const result = loadAuthenticated(() => session, async () => { started = true; return 'data' }, () => { throw new Error('redirect') })
  await Promise.resolve()
  assert.equal(started, true)
  resolveSession({ user: { id: 'admin' } })
  assert.deepEqual(await result, { session: { user: { id: 'admin' } }, data: 'data' })
})

test('redirects a signed-out visitor even when the protected request rejects', async () => {
  await assert.rejects(loadAuthenticated(async () => null, async () => { throw new Error('unauthorized') }, () => { throw new Error('redirect') }), /redirect/)
})

test('propagates data errors for an authenticated visitor', async () => {
  await assert.rejects(loadAuthenticated(async () => ({ user: { id: 'a' } }), async () => { throw new Error('data error') }, () => { throw new Error('redirect') }), /data error/)
})

test('route authentication and protected data start together and preserve route context', async () => {
  let resolveAuth!: (context: { userId: string }) => void
  const auth = new Promise<{ userId: string }>(resolve => { resolveAuth = resolve })
  let started = false
  const result = loadRouteInParallel(() => auth, async () => { started = true; return [1, 2] })
  await Promise.resolve()
  assert.equal(started, true)
  resolveAuth({ userId: 'admin' })
  assert.deepEqual(await result, { auth: { userId: 'admin' }, data: [1, 2] })
})

test('route authentication errors win over protected read errors', async () => {
  await assert.rejects(loadRouteInParallel(async () => { throw new Error('redirect') }, async () => { throw new Error('unauthorized') }), /redirect/)
})

test('router invalidation re-runs protected data loading after a change', async () => {
  let version = 0
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: '/test',
    beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => ({ userId: 'admin' }), async () => ++version); return { ...auth, __parallelData: data } },
    loader: ({ context }) => context.__parallelData,
  })
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/test'] }), isServer: false })
  await router.load()
  assert.equal(router.state.matches.at(-1)?.loaderData, 1)
  await router.invalidate()
  assert.equal(router.state.matches.at(-1)?.loaderData, 2)
})

test('guarded parameterized route reads new search values and refreshes after invalidation', async () => {
  let version = 0
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: '/test',
    validateSearch: (search: Record<string, unknown>) => ({ id: String(search.id ?? '') }),
    loaderDeps: ({ search }) => search,
    beforeLoad: async ({ search }) => { const { data } = await loadRouteInParallel(async () => undefined, async () => `${search.id}:${++version}`); return { initialData: data } },
    loader: ({ context }) => context.initialData,
  })
  const history = createMemoryHistory({ initialEntries: ['/test?id=first'] })
  const router = createRouter({ routeTree: root.addChildren([route]), history, isServer: false })
  await router.load()
  assert.equal(router.state.matches.at(-1)?.loaderData, 'first:1')
  history.push('/test?id=second')
  await router.load()
  assert.equal(router.state.matches.at(-1)?.loaderData, 'second:2')
  await router.invalidate()
  assert.equal(router.state.matches.at(-1)?.loaderData, 'second:3')
})
