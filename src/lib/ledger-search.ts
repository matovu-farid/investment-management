type SearchableLedgerEntry = {
  description: string
  effectiveDate: string
  currency: string
  sourceType: string
  lines: readonly { accountCode: string; accountName: string }[]
}

export function filterLedgerEntries<T extends SearchableLedgerEntry>(entries: readonly T[], query: string): T[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return [...entries]
  return entries.filter(entry => [entry.description, entry.effectiveDate, entry.currency, entry.sourceType,
    ...entry.lines.flatMap(line => [line.accountCode, line.accountName])]
    .some(value => value.toLocaleLowerCase().includes(term)))
}
