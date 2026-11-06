export type HoldingImportRow = { memberNumber: string | null; jointHoldingId: string | null; observedDate: string; shares: string; source: string }

export function parseHoldingCsv(input: string): { rows: HoldingImportRow[]; errors: string[] } {
  if (input.length > 200_000) return { rows: [], errors: ['CSV is too large (maximum 200,000 characters).'] }
  const records: string[][] = []
  let fields: string[] = [], field = '', quoted = false, endedQuote = false, atStart = true
  const saveField = () => { fields.push(field); field = ''; atStart = true; endedQuote = false }
  const saveRecord = () => { saveField(); records.push(fields); fields = [] }
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { quoted = false; endedQuote = true }
      else if (c === '\r' && input[i + 1] === '\n') { field += '\n'; i++ }
      else field += c
    } else if (c === ',') saveField()
    else if (c === '\n' || c === '\r') { if (c === '\r' && input[i + 1] === '\n') i++; saveRecord() }
    else if (c === '"' && atStart) { quoted = true; atStart = false }
    else if (c === '"' || endedQuote) return { rows: [], errors: ['Malformed CSV: unexpected character around a quoted field.'] }
    else { field += c; atStart = false }
  }
  if (quoted) return { rows: [], errors: ['Malformed CSV: a quoted field was not closed.'] }
  if (fields.length || field || endedQuote) saveRecord()
  if (!records.length) return { rows: [], errors: ['Enter a header and at least one holding.'] }
  records[0][0] = records[0][0].replace(/^\uFEFF/, '')
  if (records[0].length !== 5 || records[0].join(',') !== 'member_number,joint_holding_id,observed_date,shares,source') return { rows: [], errors: ['Header must be member_number,joint_holding_id,observed_date,shares,source.'] }
  const rows: HoldingImportRow[] = [], errors: string[] = [], seen = new Set<string>()
  if (records.length === 1) errors.push('Enter at least one holding.')
  if (records.length > 101) errors.push('At most 100 holdings may be imported at once.')
  for (let i = 1; i < records.length; i++) {
    const record = records[i], label = `Record ${i + 1}`
    if (record.length !== 5) { errors.push(`${label}: expected 5 columns.`); continue }
    const [member, joint, observedDate, shares, source] = record.map(v => v.trim())
    if ((!member) === (!joint) || member.length > 64 || joint.length > 128) errors.push(`${label}: enter exactly one member number or joint holding ID.`)
    const time = Date.parse(observedDate + 'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedDate) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== observedDate) errors.push(`${label}: enter a valid date as YYYY-MM-DD.`)
    if (!/^(0|[1-9]\d*)$/.test(shares) || !Number.isSafeInteger(Number(shares))) errors.push(`${label}: shares must be a nonnegative whole number within the supported range.`)
    if (!source || source.length > 500) errors.push(`${label}: source is required and must be at most 500 characters.`)
    const holder = member ? `member:${member}` : `joint:${joint}`
    if (seen.has(holder)) errors.push(`${label}: holder appears more than once.`)
    seen.add(holder)
    rows.push({ memberNumber: member || null, jointHoldingId: joint || null, observedDate, shares, source })
  }
  return { rows, errors }
}
