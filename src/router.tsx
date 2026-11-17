import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { PageError } from './components/page-error'
import { PageNotFound } from './components/page-not-found'
import { RoutePending } from './components/route-pending'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultErrorComponent: PageError,
    defaultNotFoundComponent: PageNotFound,
    defaultPendingComponent: () => <RoutePending />,
    defaultPendingMs: 250,
    defaultPreloadStaleTime: 30_000,
    scrollRestoration: true,
    // Protected reads start with the route guard. Intent preloading would run
    // those reads on hover and then again on navigation, doubling database work.
    defaultPreload: false,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
