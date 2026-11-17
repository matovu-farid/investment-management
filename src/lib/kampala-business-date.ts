/** Match the database's Uganda business date (UTC+03:00). */
export function kampalaBusinessDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
