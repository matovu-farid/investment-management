/** The caller authenticates once; every supplied read must enforce its own access guard. */
export async function loadWorkspace<U extends { id: string }, O extends { kind: 'admin' | 'member' }, F, S>(
  user: U | null,
  reads: { overview: (actorId: string) => Promise<O>; funds: (actorId: string) => Promise<F>; shares: (actorId: string) => Promise<S> },
) {
  if (!user) return null
  // Guarded reads can start at once. Only return details appropriate to the
  // verified overview; a failed overview must not disclose either result.
  const [overview, funds, shares] = await Promise.all([
    reads.overview(user.id).catch(() => null),
    reads.funds(user.id).catch(() => null),
    reads.shares(user.id).catch(() => null),
  ])
  return {
    user,
    overview,
    fundObservations: overview?.kind === 'admin' ? funds : null,
    shareValues: overview?.kind === 'member' ? shares : null,
  }
}
