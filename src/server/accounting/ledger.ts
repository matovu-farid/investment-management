import { postJournal } from './posting.ts'

export type Account = { id: string; code: string; name: string; currency: string }
type EntryRow = { id: string; currency: string; effectiveDate: string; description: string; createdBy: string; createdAt: string; reversesEntryId: string | null; sourceType: string; reversedById: string | null; accountCode: string; accountName: string; side: 'debit' | 'credit'; amountMinor: number }
export type LedgerEntry = Omit<EntryRow, 'accountCode' | 'accountName' | 'side' | 'amountMinor'> & { lines: Pick<EntryRow, 'accountCode' | 'accountName' | 'side' | 'amountMinor'>[] }

async function requireAdmin(db: D1Database, actorId: string | null) {
  if (!actorId || (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId).first<{role:string}>())?.role !== 'admin') throw new Error('Unauthorized')
}
export async function createAccount(db: D1Database, actorId: string | null, input: unknown): Promise<Account> {
  await requireAdmin(db, actorId)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid account')
  const v=input as Record<string, unknown>
  if (typeof v.code !== 'string' || !v.code.trim() || v.code.trim().length > 40 || typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 200 || typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency)) throw new Error('Invalid account')
  if (typeof v.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.idempotencyKey)) throw new Error('Invalid account request ID')
  const key=v.idempotencyKey.toLowerCase()
  const account={id:crypto.randomUUID(),code:v.code.trim(),name:v.name.trim(),currency:v.currency}
  await db.prepare(`INSERT INTO ledger_accounts(id,code,name,currency,idempotency_key,request_actor) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ON CONFLICT(idempotency_key) DO NOTHING`).bind(account.id,account.code,account.name,account.currency,key,actorId,actorId).run()
  const saved=await db.prepare(`SELECT id,code,name,currency,request_actor AS requestActor FROM ledger_accounts WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(key,actorId).first<Account & {requestActor:string}>()
  if (!saved || saved.code!==account.code || saved.name!==account.name || saved.currency!==account.currency || saved.requestActor!==actorId) throw new Error('Request key already used for a different account')
  return {id:saved.id,code:saved.code,name:saved.name,currency:saved.currency}
}
export async function listLedger(db: D1Database, actorId: string | null) {
  await requireAdmin(db,actorId)
  const [accountResult,rowResult,authority]=await db.batch([
    db.prepare("SELECT id,code,name,currency FROM ledger_accounts WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY code").bind(actorId),
    db.prepare(`SELECT e.id,e.currency,e.effective_date AS effectiveDate,e.description,e.created_by AS createdBy,e.created_at AS createdAt,e.reverses_entry_id AS reversesEntryId,e.source_type AS sourceType,(SELECT r.id FROM journal_entries r WHERE r.reverses_entry_id=e.id AND r.status='posted') AS reversedById,a.code AS accountCode,a.name AS accountName,l.side,l.amount_minor AS amountMinor FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN ledger_accounts a ON a.id=l.account_id WHERE e.status='posted' AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY e.effective_date DESC,e.created_at DESC,e.id,l.id`).bind(actorId),
    db.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actorId),
  ])
  if (!authority.results.length) throw new Error('Unauthorized')
  const accounts=accountResult.results as Account[], rows=rowResult.results as EntryRow[]
  const byId=new Map<string, LedgerEntry>()
  for (const {accountCode,accountName,side,amountMinor,...entry} of rows) {
    if (!byId.has(entry.id)) byId.set(entry.id,{...entry,lines:[]})
    byId.get(entry.id)!.lines.push({accountCode,accountName,side,amountMinor})
  }
  return {accounts,entries:[...byId.values()]}
}
/** Manual source keys are reserved for this interface; callers cannot forge business sources. */
export async function postManualJournal(db: D1Database, actorId: string | null, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid journal input')
  const v=input as Record<string,unknown>
  if (typeof v.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId)) throw new Error('Invalid request ID')
  return postJournal(db,actorId,{currency:v.currency,effectiveDate:v.effectiveDate,description:v.description,sourceType:'manual',sourceId:v.requestId,reversesEntryId:null,lines:v.lines})
}

/** Derive the reversing lines from the original; no caller-supplied lines are accepted. */
export async function reverseManualJournal(db: D1Database, actorId: string | null, input: unknown) {
  await requireAdmin(db, actorId)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid reversal')
  const v=input as Record<string,unknown>
  if (typeof v.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId) || typeof v.entryId !== 'string' || !v.entryId.trim() || v.entryId.length>128 || typeof v.reason !== 'string' || !v.reason.trim() || v.reason.trim().length>450) throw new Error('Invalid reversal')
  const original=await db.prepare("SELECT id,currency,description,source_type AS sourceType FROM journal_entries WHERE id=? AND status='posted' AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(v.entryId,actorId).first<{id:string;currency:string;description:string;sourceType:string}>()
  if (!original || original.sourceType !== 'manual') throw new Error('Only posted manual journals can be reversed here')
  const existing=await db.prepare(`SELECT source_id AS sourceId FROM journal_entries WHERE reverses_entry_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(original.id,actorId).first<{sourceId:string}>()
  if (existing && existing.sourceId !== v.requestId) throw new Error('Journal already reversed')
  const lines=(await db.prepare(`SELECT account_id AS accountId,side,amount_minor AS amountMinor FROM journal_lines WHERE entry_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(original.id,actorId).all<{accountId:string;side:'debit'|'credit';amountMinor:number}>()).results
  return postJournal(db,actorId,{currency:original.currency,effectiveDate:v.effectiveDate,description:`Reversal: ${v.reason.trim()}`,sourceType:'manual-reversal',sourceId:v.requestId,reversesEntryId:original.id,lines:lines.map(line=>({...line,side:line.side==='debit'?'credit':'debit'}))})
}
