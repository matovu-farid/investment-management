/** Calendar quadrimesters shown in the 2026 board pack, printed p. 19. */
export function quadrimesterDates(year: string, period: string): { start: string; end: string } | null {
  if (!/^(19|20|21)\d{2}$/.test(year)) return null
  const dates: Record<string, [string, string]> = {
    '1': ['01-01', '04-30'],
    '2': ['05-01', '08-31'],
    '3': ['09-01', '12-31'],
  }
  const selected = dates[period]
  return selected ? { start: `${year}-${selected[0]}`, end: `${year}-${selected[1]}` } : null
}
