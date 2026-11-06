export function eligibleFulfilmentBookings<T extends { status: string; requestedMinor: number; fulfilledMinor?: number }>(bookings: readonly T[]): T[] {
  return bookings.filter(b => (b.status === 'waiting' || b.status === 'held') && (b.fulfilledMinor ?? 0) < b.requestedMinor)
}
