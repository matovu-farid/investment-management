export type CashEntry = { id:string; entryDate:string; direction:'receipt'|'payment'; amountMinor:string; currency:string; counterparty:string; reference:string; description:string; createdBy:string; createdAt:string; voidedAt:string|null; voidReason:string|null; voidedBy:string|null }
const admin = "EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
const columns = 'e.id,e.entry_date AS entryDate,e.direction,e.amount_minor AS amountMinor,e.currency,e.counterparty,e.reference,e.description,e.created_by AS createdBy,e.created_at AS createdAt,v.created_at AS voidedAt,v.reason AS voidReason,v.created_by AS voidedBy'
async function requireAdmin(db:D1Database,id:string|null) { if(!id||!await db.prepare(`SELECT 1 WHERE ${admin}`).bind(id).first()) throw new Error('Unauthorized'); return id }
function object(value:unknown):Record<string,unknown> { if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid request'); return value as Record<string,unknown> }
function text(value:unknown,max:number,required=true) { if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())) throw new Error('Invalid text'); return value.trim() }
function date(value:unknown) { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Invalid date'); return value }
function key(value:unknown) { if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid request key'); return value.toLowerCase() }
export async function listCashEntries(db:D1Database,actorId:string|null,input:unknown) {
 const actor=await requireAdmin(db,actorId),v=object(input),from=date(v.from),to=date(v.to)
 if(from>to) throw new Error('Invalid period')
 const rows=await db.prepare(`SELECT ${columns} FROM cash_entries e LEFT JOIN cash_entry_voids v ON v.entry_id=e.id WHERE e.entry_date>=? AND e.entry_date<=? AND ${admin} ORDER BY e.entry_date DESC,e.created_at DESC,e.id`).bind(from,to,actor).all<CashEntry>()
 // A second check catches a revoked role even when the range is empty.
 await requireAdmin(db,actor)
 return {entries:rows.results}
}
export async function recordCashEntry(db:D1Database,actorId:string|null,input:unknown) {
 const actor=await requireAdmin(db,actorId),v=object(input),requestKey=key(v.requestKey),entryDate=date(v.entryDate),description=text(v.description,450),counterparty=text(v.counterparty,200,false),reference=text(v.reference,200,false)
 if(v.direction!=='receipt'&&v.direction!=='payment') throw new Error('Invalid direction')
 if(typeof v.amountMinor!=='string'||!/^[1-9][0-9]{0,29}$/.test(v.amountMinor)||typeof v.currency!=='string'||!/^[A-Z]{3}$/.test(v.currency)) throw new Error('Invalid amount or currency')
 const direction=v.direction,amountMinor=v.amountMinor,currency=v.currency
 const find=()=>db.prepare(`SELECT ${columns} FROM cash_entries e LEFT JOIN cash_entry_voids v ON v.entry_id=e.id WHERE e.request_key=? AND ${admin}`).bind(requestKey,actor).first<CashEntry>()
 let saved=await find()
 if(!saved){try {await db.prepare(`INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${admin} AND NOT EXISTS(SELECT 1 FROM cash_entries WHERE request_key=?)`).bind(crypto.randomUUID(),entryDate,direction,amountMinor,currency,counterparty,reference,description,requestKey,actor,actor,requestKey).run()} catch(e) {saved=await find();if(!saved) throw e} saved=await find()}
 if(!saved||saved.entryDate!==entryDate||saved.direction!==direction||saved.amountMinor!==amountMinor||saved.currency!==currency||saved.counterparty!==counterparty||saved.reference!==reference||saved.description!==description||saved.createdBy!==actor) throw new Error('Request key already used or unavailable')
 return {id:saved.id,active:saved.voidedAt===null}
}
export async function voidCashEntry(db:D1Database,actorId:string|null,input:unknown) {
 const actor=await requireAdmin(db,actorId),v=object(input),requestKey=key(v.requestKey),entryId=text(v.entryId,128),reason=text(v.reason,450)
 type Saved={id:string;entryId:string;reason:string;createdBy:string}
 const find=()=>db.prepare(`SELECT id,entry_id AS entryId,reason,created_by AS createdBy FROM cash_entry_voids WHERE request_key=? AND ${admin}`).bind(requestKey,actor).first<Saved>()
 let saved=await find()
 if(!saved){try {await db.prepare(`INSERT INTO cash_entry_voids(id,entry_id,reason,request_key,created_by) SELECT ?,?,?,?,? WHERE ${admin} AND NOT EXISTS(SELECT 1 FROM cash_entry_voids WHERE request_key=?)`).bind(crypto.randomUUID(),entryId,reason,requestKey,actor,actor,requestKey).run()} catch(e) {saved=await find();if(!saved) throw e} saved=await find()}
 if(!saved||saved.entryId!==entryId||saved.reason!==reason||saved.createdBy!==actor) throw new Error('Request key already used or unavailable')
 return {id:saved.id}
}
