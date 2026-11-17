/** Search only fields already visible to this user; empty input keeps all rows. */
export function matchesShareSearch(query: string, fields: readonly (string | number | null | undefined)[]): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  return normalized === '' || fields.some(field => String(field ?? '').toLocaleLowerCase().includes(normalized))
}
