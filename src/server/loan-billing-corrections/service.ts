type Event = { id:string; loanId:string; eventDate:string; accrualJournalId:string|null; repaymentJournalId:string|null; currency:string }
type Line = { entryId:string; accountId:string; side:'debit'|'credit'; amountMinor:number }
type Saved = {id:string;eventId:string;loanId:string;requestKey:string;expectedRevision:number;reason:string;createdBy:string;status:string;effectiveDate:string;accrualReversalId:string|null;repaymentReversalId:string|null}
const authority="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid correction');return v as Record<string,unknown>}
function text(v:unknown,max=128):string{if(typeof v!=='string'||v!==v.trim()||!v||v.length>max)throw new Error('Invalid correction');return v}

/** Load the latest active event, both original journals and its revision from one snapshot. */
export async function previewBillingCorrection(db:D1Database,actor:string|null,input:unknown){
 if(!actor)throw new Error('Unauthorized');const eventId=text(object(input).eventId)
 const [permission,events,revisions,lines]=await db.batch([
  db.prepare(`SELECT 1 WHERE ${authority}`).bind(actor),
  db.prepare(`SELECT e.id,e.loan_id AS loanId,e.event_date AS eventDate,e.accrual_journal_id AS accrualJournalId,e.repayment_journal_id AS repaymentJournalId,c.currency FROM loan_billing_events e JOIN loan_billing_configs c ON c.loan_id=e.loan_id WHERE e.id=? AND ${authority} AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=e.id AND v.status='final') AND NOT EXISTS(SELECT 1 FROM loan_billing_events later WHERE later.loan_id=e.loan_id AND later.rowid>e.rowid AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=later.id AND v.status='final'))`).bind(eventId,actor),
  db.prepare(`SELECT r.revision FROM loan_billing_revisions r JOIN loan_billing_events e ON e.loan_id=r.loan_id WHERE e.id=? AND ${authority}`).bind(eventId,actor),
  db.prepare(`SELECT j.id AS entryId,l.account_id AS accountId,l.side,l.amount_minor AS amountMinor FROM loan_billing_events e JOIN journal_entries j ON j.id IN(e.accrual_journal_id,e.repayment_journal_id) JOIN journal_lines l ON l.entry_id=j.id WHERE e.id=? AND ${authority} AND j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id=j.id AND x.status='posted') ORDER BY j.id,l.id`).bind(eventId,actor),
 ])
 if(!permission.results.length)throw new Error('Unauthorized')
 const event=events.results[0] as Event|undefined, revision=(revisions.results[0] as {revision:number}|undefined)?.revision, rows=lines.results as Line[]
 if(!event||revision===undefined)throw new Error('Only the latest active billing event can be corrected')
 for(const id of [event.accrualJournalId,event.repaymentJournalId])if(id&&!rows.some(l=>l.entryId===id))throw new Error('Original journal is missing or already reversed')
 return {event,revision,lines:rows}
}

/** Reverse each original journal on its date in one atomic batch, retaining the audit record. */
export async function correctBillingEvent(db:D1Database,actor:string|null,input:unknown){
 if(!actor)throw new Error('Unauthorized');const v=object(input),eventId=text(v.eventId),key=text(v.requestKey),reason=text(v.reason,450),effectiveDate=text(v.expectedEventDate,10),revision=v.expectedRevision
 if(v.periodOpenConfirmed!==true)throw new Error('Confirm the original accounting period is open')
 if(!Number.isSafeInteger(revision)||Number(revision)<0)throw new Error('Invalid revision')
 const find=()=>db.prepare(`SELECT id,event_id AS eventId,loan_id AS loanId,request_key AS requestKey,expected_revision AS expectedRevision,reason,created_by AS createdBy,status,effective_date AS effectiveDate,accrual_reversal_journal_id AS accrualReversalId,repayment_reversal_journal_id AS repaymentReversalId FROM loan_billing_event_voids WHERE request_key=? AND ${authority}`).bind(key,actor).first<Saved>()
 const match=(s:Saved)=>{if(s.eventId!==eventId||s.expectedRevision!==revision||s.reason!==reason||s.createdBy!==actor||s.effectiveDate!==effectiveDate||s.status!=='final')throw new Error('Correction request key already used for different details');return s}
 const existing=await find();if(existing)return match(existing)
 const preview=await previewBillingCorrection(db,actor,{eventId});if(preview.revision!==revision||preview.event.eventDate!==effectiveDate)throw new Error('Billing review changed; preview again')
 const id=crypto.randomUUID(),accrualId=preview.event.accrualJournalId?crypto.randomUUID():null,repaymentId=preview.event.repaymentJournalId?crypto.randomUUID():null
 const statements:D1PreparedStatement[]=[db.prepare(`INSERT INTO loan_billing_event_voids(id,event_id,loan_id,request_key,expected_revision,reason,created_by,status,accrual_reversal_journal_id,repayment_reversal_journal_id,effective_date,period_open_confirmed) VALUES(?,?,?,?,?,?,?,'pending',?,?,?,1)`).bind(id,eventId,preview.event.loanId,key,revision,reason,actor,accrualId,repaymentId,effectiveDate)]
 const addReversal=(newId:string,originalId:string,suffix:string)=>{
  statements.push(db.prepare(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES(?,?,?,?,?,?,?,?)`).bind(newId,preview.event.currency,effectiveDate,`Billing correction ${id}: ${reason}`,'loan-billing-reversal',`${id}:${suffix}`,actor,originalId))
  for(const line of preview.lines.filter(l=>l.entryId===originalId))statements.push(db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),newId,line.accountId,line.side==='debit'?'credit':'debit',line.amountMinor))
  statements.push(db.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").bind(newId))
 }
 if(accrualId&&preview.event.accrualJournalId)addReversal(accrualId,preview.event.accrualJournalId,'accrual')
 if(repaymentId&&preview.event.repaymentJournalId)addReversal(repaymentId,preview.event.repaymentJournalId,'repayment')
 statements.push(db.prepare("UPDATE loan_billing_event_voids SET status='final' WHERE id=?").bind(id))
 try{await db.batch(statements)}catch(error){const saved=await find();if(saved)return match(saved);throw error}
 const saved=await find();if(!saved)throw new Error('Correction not confirmed');return match(saved)
}
