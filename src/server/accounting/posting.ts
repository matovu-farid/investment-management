import { validateJournal, type JournalLine } from '../../lib/accounting/journal.ts'

type PostedEntry = { id: string; currency: string; effectiveDate: string; description: string; sourceType: string; sourceId: string; createdBy: string; status: string; reversesEntryId: string | null }
type Posting = Omit<PostedEntry, 'id' | 'createdBy' | 'status'> & { lines: JournalLine[] }

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Invalid journal input')
  return value.trim()
}
function parse(input: unknown): Posting {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid journal input')
  const v = input as Record<string, unknown>
  const currency = text(v.currency, 3)
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency')
  const effectiveDate = text(v.effectiveDate, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(effectiveDate)) || new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate) throw new Error('Invalid date')
  if (!Array.isArray(v.lines) || v.lines.length > 100) throw new Error('Invalid journal lines')
  const lines = v.lines.map((line: unknown) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new Error('Invalid journal line')
    const l = line as Record<string, unknown>
    return { accountId: text(l.accountId, 128), side: l.side, amountMinor: l.amountMinor } as JournalLine
  })
  validateJournal(lines)
  return { currency, effectiveDate, description: text(v.description, 500), sourceType: text(v.sourceType, 100), sourceId: text(v.sourceId, 200), reversesEntryId: v.reversesEntryId == null ? null : text(v.reversesEntryId, 128), lines }
}
function lineFingerprint(lines: JournalLine[]): string {
  return JSON.stringify(lines.map(l => [l.accountId, l.side, l.amountMinor]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
}

/** Internal server-only operation; callers derive actorId from a verified session. */
export async function postJournal(db: D1Database, actorId: string | null, input: unknown, beforePosting?: (entryId:string) => D1PreparedStatement[]): Promise<PostedEntry> {
  if (!actorId || (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId).first<{role:string}>())?.role !== 'admin') throw new Error('Unauthorized')
  const entry = parse(input)
  const lookup = async (): Promise<PostedEntry | null> => db.prepare(`SELECT id,currency,effective_date AS effectiveDate,description,source_type AS sourceType,source_id AS sourceId,created_by AS createdBy,status,reverses_entry_id AS reversesEntryId FROM journal_entries WHERE source_type=? AND source_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(entry.sourceType,entry.sourceId,actorId).first<PostedEntry>()
  const confirmMatch = async (saved: PostedEntry): Promise<PostedEntry> => {
    const lines = (await db.prepare(`SELECT account_id AS accountId,side,amount_minor AS amountMinor FROM journal_lines WHERE entry_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(saved.id,actorId).all<JournalLine>()).results
    if (saved.status !== 'posted' || saved.createdBy !== actorId || saved.currency !== entry.currency || saved.effectiveDate !== entry.effectiveDate || saved.description !== entry.description || saved.reversesEntryId !== entry.reversesEntryId || lineFingerprint(lines) !== lineFingerprint(entry.lines)) throw new Error('Journal source already used for different data')
    return saved
  }
  const prior = await lookup()
  if (prior) return confirmMatch(prior)
  const id = crypto.randomUUID()
  const statements = [db.prepare('INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES (?,?,?,?,?,?,?,?)').bind(id,entry.currency,entry.effectiveDate,entry.description,entry.sourceType,entry.sourceId,actorId,entry.reversesEntryId),
    ...entry.lines.map(l => db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,l.accountId,l.side,l.amountMinor)),
    ...(beforePosting?.(id) ?? []),
    db.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").bind(id)]
  try { await db.batch(statements) } catch (error) {
    // A concurrent identical source may have posted while this batch was queued.
    const existing = await lookup()
    if (existing) return confirmMatch(existing)
    throw error
  }
  const posted = await lookup()
  if (!posted) throw new Error('Journal could not be confirmed')
  return confirmMatch(posted)
}
