export type AcknowledgmentKind = 'disbursement' | 'repayment'
export type Acknowledgment = {
 kind:AcknowledgmentKind; id:string; loanId:string; memberName:string; memberNumber:string
 amountMinor:number; currency:string; date:string; reference:string|null
 voidedAt:string|null; voidReason:string|null; loanVoidedAt:string|null; loanVoidReason:string|null
 capturedAt:string
 openings:Array<{journalId:string;principalMinor:number;openingDate:string;source:string;correctionReason:string|null}>
 journals:Array<{journalId:string;date:string;isCorrection:boolean;reversalId:string|null;reversalDate:string|null;dispatchRoute:string|null}>
}
type Source = Omit<Acknowledgment,'kind'|'id'|'capturedAt'|'journals'|'openings'>
type Journal = {journalId:string;date:string;isCorrection:number;reversalId:string|null;reversalDate:string|null;dispatchRoute:string|null}

export async function getAcknowledgment(db:D1Database, actor:string|null, input:unknown):Promise<Acknowledgment> {
 if(!actor || (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role!=='admin') throw new Error('Unauthorized')
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid acknowledgment request')
 const {kind,id}=input as Record<string,unknown>
 if((kind!=='disbursement'&&kind!=='repayment') || typeof id!=='string' || !id.trim() || id.length>128 || id!==id.trim()) throw new Error('Invalid acknowledgment request')
 const isLoan=kind==='disbursement'
 const sourceQuery=isLoan ? `SELECT l.id AS loanId,m.full_name AS memberName,m.member_number AS memberNumber,l.principal_minor AS amountMinor,l.currency,l.disbursement_date AS date,l.reference,v.created_at AS voidedAt,v.reason AS voidReason,v.created_at AS loanVoidedAt,v.reason AS loanVoidReason FROM loans l JOIN members m ON m.id=l.member_id LEFT JOIN loan_source_voids v ON v.source_kind='loan' AND v.source_id=l.id WHERE l.id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')` : `SELECT l.id AS loanId,m.full_name AS memberName,m.member_number AS memberNumber,r.amount_minor AS amountMinor,l.currency,r.payment_date AS date,r.reference,rv.created_at AS voidedAt,rv.reason AS voidReason,lv.created_at AS loanVoidedAt,lv.reason AS loanVoidReason FROM loan_repayments r JOIN loans l ON l.id=r.loan_id JOIN members m ON m.id=l.member_id LEFT JOIN loan_source_voids rv ON rv.source_kind='repayment' AND rv.source_id=r.id LEFT JOIN loan_source_voids lv ON lv.source_kind='loan' AND lv.source_id=l.id WHERE r.id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`
 const journalQuery=`WITH versions AS (
 SELECT j.id AS journalId,j.effective_date AS date,0 AS isCorrection FROM journal_entries j WHERE j.source_type=? AND j.source_id=? AND j.status='posted'
 UNION ALL SELECT j.id,j.effective_date,1 FROM journal_corrections c JOIN journal_entries j ON j.id=c.journal_id AND j.status='posted' WHERE c.source_kind=? AND c.source_id=?
 UNION ALL SELECT j.id,j.effective_date,EXISTS(SELECT 1 FROM loan_billing_events prior WHERE prior.repayment_id=e.repayment_id AND prior.rowid<e.rowid AND prior.repayment_journal_id IS NOT NULL)
 FROM loan_billing_events e JOIN journal_entries j ON j.id=e.repayment_journal_id AND j.source_type='loan-billing-repayment' AND j.source_id=e.id AND j.status='posted'
 WHERE ?='repayment' AND e.repayment_id=?
 UNION ALL SELECT j.id,j.effective_date,0 FROM loan_openings o JOIN journal_entries j ON j.id=o.journal_id AND j.source_type='loan-opening' AND j.status='posted' WHERE ?='disbursement' AND o.loan_id=?
 UNION ALL SELECT j.id,j.effective_date,0 FROM loan_opening_corrections c JOIN journal_entries j ON j.id=c.original_journal_id AND j.source_type='loan-opening' AND j.status='posted' WHERE ?='disbursement' AND c.loan_id=? AND c.status='final'
 ) SELECT v.journalId,v.date,v.isCorrection,r.id AS reversalId,r.effective_date AS reversalDate,d.route AS dispatchRoute FROM versions v LEFT JOIN journal_entries r ON r.reverses_entry_id=v.journalId AND r.status='posted' LEFT JOIN loan_dispatch_declarations d ON d.journal_id=v.journalId WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY v.date,v.journalId`
 const openingQuery=`SELECT journal_id AS journalId,principal_minor AS principalMinor,opening_date AS openingDate,source,NULL AS correctionReason FROM loan_openings WHERE ?='disbursement' AND loan_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') UNION ALL SELECT original_journal_id, json_extract(original_details,'$.principalMinor'),json_extract(original_details,'$.openingDate'),json_extract(original_details,'$.source'),reason FROM loan_opening_corrections WHERE ?='disbursement' AND loan_id=? AND status='final' AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY openingDate,journalId`
 const [sourceResult,journalResult,openingResult]=await db.batch([db.prepare(sourceQuery).bind(id,actor),db.prepare(journalQuery).bind(isLoan?'loan-disbursement':'loan-repayment',id,isLoan?'loan':'repayment',id,kind,id,kind,id,kind,id,actor),db.prepare(openingQuery).bind(kind,id,actor,kind,id,actor)])
 const source=(sourceResult.results as Source[])[0]
 if(!source) throw new Error('Acknowledgment not found')
 return {kind,id,...source,openings:openingResult.results as Acknowledgment['openings'],capturedAt:new Date().toISOString(),journals:(journalResult.results as Journal[]).map(j=>({...j,isCorrection:Boolean(j.isCorrection)}))}
}
