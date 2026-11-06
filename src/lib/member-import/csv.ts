export type MemberImportRow = { memberNumber: string; fullName: string; email: string | null }
export function parseMemberCsv(input: string): { rows: MemberImportRow[]; errors: string[] } {
  if (input.length > 100_000) return { rows: [], errors: ['CSV is too large (maximum 100,000 characters).'] }
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
  if (!records.length) return { rows: [], errors: ['Enter a header and at least one member.'] }
  records[0][0] = records[0][0].replace(/^\uFEFF/, '')
  const header = records[0]
  if (!(header.length === 2 || header.length === 3) || header[0] !== 'member_number' || header[1] !== 'full_name' || (header.length === 3 && header[2] !== 'email')) return { rows: [], errors: ['Header must be member_number,full_name or member_number,full_name,email.'] }
  const errors: string[] = [], rows: MemberImportRow[] = [], seen = new Set<string>()
  if (records.length === 1) errors.push('Enter at least one member.')
  if (records.length > 101) errors.push('At most 100 members may be imported at once.')
  for (let i = 1; i < records.length; i++) {
    const record = records[i], label = `Record ${i + 1}`
    if (record.length !== header.length) { errors.push(`${label}: expected ${header.length} columns.`); continue }
    const memberNumber = record[0].trim(), fullName = record[1].trim(), email = record[2]?.trim() || null
    if (!memberNumber || memberNumber.length > 64) errors.push(`${label}: member number is required and must be at most 64 characters.`)
    if (!fullName || fullName.length > 200) errors.push(`${label}: full name is required and must be at most 200 characters.`)
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.push(`${label}: invalid email address.`)
    if (memberNumber && seen.has(memberNumber)) errors.push(`${label}: Duplicate member number ${memberNumber}.`)
    seen.add(memberNumber); rows.push({ memberNumber, fullName, email })
  }
  return { rows, errors }
}
