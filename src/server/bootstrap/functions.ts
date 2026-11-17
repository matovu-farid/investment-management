import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, setResponseHeader } from '@tanstack/react-start/server'
import { bootstrapAvailable, createFirstAdmin } from './service'

export const getBootstrapAvailability = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'no-store')
  const { env } = await import('cloudflare:workers')
  return bootstrapAvailable(env.DB)
})

export const getLoginStateFn = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const [{ env }, { auth, passwordRecoveryEnabled }, { loadLoginState }] = await Promise.all([
    import('cloudflare:workers'), import('../../lib/auth'), import('./login-state'),
  ])
  return loadLoginState({
    session: async () => !!await auth.api.getSession({ headers: getRequestHeaders() }),
    bootstrap: () => bootstrapAvailable(env.DB),
    recovery: passwordRecoveryEnabled,
  })
})

export const createFirstAdminFn = createServerFn({ method: 'POST' }).validator((data: unknown) => data).handler(async ({ data }) => {
  setResponseHeader('Cache-Control', 'no-store')
  const { env } = await import('cloudflare:workers')
  let ip = getRequestHeaders().get('cf-connecting-ip')
  if (!ip && /^http:\/\/localhost(?::\d+)?$/.test(env.BETTER_AUTH_URL)) ip = '127.0.0.1'
  return createFirstAdmin(env.DB, data, ip)
})
