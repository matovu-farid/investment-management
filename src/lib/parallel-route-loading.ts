/**
 * Starts a protected read alongside the route's session check. The read must
 * independently authorize the request on the server; this helper is only for
 * avoiding a browser round trip before starting that already-protected read.
 */
export async function loadAuthenticated<S, T>(
  getSession: () => Promise<S | null>,
  read: () => Promise<T>,
  redirectSignedOut: () => never,
): Promise<{ session: S; data: T }> {
  // Capture a rejection immediately: signed-out redirects must win over a
  // protected read's authorization error, and leave no unhandled rejection.
  const pending = Promise.resolve().then(read).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  )
  const session = await getSession()
  if (!session) redirectSignedOut()
  const result = await pending
  if (!result.ok) throw result.error
  return { session, data: result.value }
}

/** Parallel route guard and independently authorized read, preserving guard errors. */
export async function loadRouteInParallel<A, T>(authenticate: () => Promise<A>, read: () => Promise<T>): Promise<{ auth: A; data: T }> {
  const pending = Promise.resolve().then(read).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  )
  const auth = await authenticate()
  const result = await pending
  if (!result.ok) throw result.error
  return { auth, data: result.value }
}
