import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { secureDynamicResponse } from './server/cache-policy'

// Server functions are same-origin RPCs. Keep this explicit if other global
// middleware is added: a custom start instance replaces Start's default guard.
// Better Auth API routes are not server functions and retain their own checks.
const csrf = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
})

// Static assets are served by Cloudflare's asset binding and never pass through
// this middleware. Every dynamic route and server-function response is private.
const privateDynamicResponse = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  const result = await next()
  return { ...result, response: secureDynamicResponse(result.response) }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [privateDynamicResponse, csrf],
}))
