import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { PageError } from './components/page-error'
import { PageNotFound } from './components/page-not-found'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultErrorComponent: PageError,
    defaultNotFoundComponent: PageNotFound,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
