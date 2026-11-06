// The register is ordered by observation date, then recording time, newest first.
export function latestFundObservations<T extends { observedDate: string; voidedAt: string | null }>(observations: readonly T[]): T[] {
  const latestDate = observations.find(observation => observation.voidedAt === null)?.observedDate
  return latestDate ? observations.filter(observation => observation.voidedAt === null && observation.observedDate === latestDate) : []
}
