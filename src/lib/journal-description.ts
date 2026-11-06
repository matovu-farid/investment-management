/** Render generated source descriptions without exposing their length-prefix encoding. */
export function formatJournalDescription(sourceType: string, description: string): string {
  const formats: Record<string, { prefix: string; labels: string[] }> = {
    'loan-disbursement': { prefix: 'Loan principal disbursement ', labels: ['member'] },
    'loan-repayment': { prefix: 'Loan repayment ', labels: ['loan', 'member'] },
    'investment-transaction': { prefix: 'Investment transaction ', labels: ['investment', 'type'] },
  }
  const format = formats[sourceType]
  if (!format || !description.startsWith(format.prefix)) return description
  const chars = Array.from(description.slice(format.prefix.length))
  let offset = 0
  function token(): string | null {
    const start = offset
    while (offset < chars.length && /[0-9]/.test(chars[offset])) offset++
    if (offset === start || chars[offset] !== ':') return null
    const length = Number(chars.slice(start, offset).join(''))
    if (!Number.isSafeInteger(length) || length < 1 || length > chars.length - offset - 1) return null
    offset++
    const value = chars.slice(offset, offset + length).join('')
    offset += length
    return value
  }
  const first = token()
  if (first === null) return description
  let result = format.prefix + first
  for (const label of format.labels) {
    const separator = Array.from(` ${label} `)
    if (separator.some((char, index) => chars[offset + index] !== char)) return description
    offset += separator.length
    const value = token()
    if (value === null) return description
    result += ` · ${label} ${value}`
  }
  return offset === chars.length ? result : description
}
