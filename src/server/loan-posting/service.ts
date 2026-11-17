import { postJournal } from '../accounting/posting.ts'

type Loan = {id:string; memberId:string; memberName:string; principalMinor:number; currency:string; disbursementDate:string; journalId:string|null; reversalId:string|null; openingJournalId:string|null; openingDate:string|null; openingPrincipalMinor:number|null; dispatchRoute:string|null}
type Account = {id:string; code:string; name:string; currency:string}
export type JournalLine = {entryId:string; accountCode:string; accountName:string; side:'debit'|'credit'; amountMinor:number}
async function requireAdmin(db:D1Database, actor:string|null) {
 if (!actor || (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role !== 'admin') throw new Error('Unauthorized')
}
function id(value:unknown):string {
 if(typeof value!=='string' || !value.trim() || value.length>128) throw new Error('Invalid selection')
 return value.trim()
}
export async function listLoanPosting(db:D1Database,actor:string|null) {
 if(!actor) throw new Error('Unauthorized')
 const authority="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
 const [loans,accounts,journalLines,permission]=await db.batch([
  db.prepare(`SELECT l.id,l.member_id AS memberId,m.full_name AS memberName,l.principal_minor AS principalMinor,l.currency,l.disbursement_date AS disbursementDate,j.id AS journalId,o.journal_id AS openingJournalId,o.opening_date AS openingDate,o.principal_minor AS openingPrincipalMinor,(SELECT d.route FROM loan_dispatch_declarations d WHERE d.journal_id=j.id) AS dispatchRoute,(SELECT r.id FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted') AS reversalId FROM loans l JOIN members m ON m.id=l.member_id LEFT JOIN loan_openings o ON o.loan_id=l.id LEFT JOIN journal_entries j ON j.source_type='loan-disbursement' AND j.source_id=l.id AND j.status='posted' WHERE ${authority} AND NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) ORDER BY l.disbursement_date DESC,l.id`).bind(actor),
  db.prepare(`SELECT id,code,name,currency FROM ledger_accounts WHERE ${authority} ORDER BY code`).bind(actor),
  db.prepare(`SELECT j.id AS entryId,a.code AS accountCode,a.name AS accountName,l.side,l.amount_minor AS amountMinor FROM journal_entries j JOIN journal_lines l ON l.entry_id=j.id JOIN ledger_accounts a ON a.id=l.account_id WHERE ${authority} AND j.source_type='loan-disbursement' AND j.status='posted' ORDER BY j.id,l.id`).bind(actor),
  db.prepare(`SELECT 1 WHERE ${authority}`).bind(actor),
 ])
 if(!permission.results.length) throw new Error('Unauthorized')
 return {loans:loans.results as Loan[],accounts:accounts.results as Account[],journalLines:journalLines.results as JournalLine[]}
}
/** Explicit account selection; loan amount, date and currency never come from the client. */
export async function postLoanDisbursement(db:D1Database,actor:string|null,input:unknown) {
 await requireAdmin(db,actor)
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid selection')
 const v=input as Record<string,unknown>, loanId=id(v.loanId), receivable=id(v.receivableAccountId), cash=id(v.cashAccountId)
 if(receivable===cash) throw new Error('Choose different accounts')
 const loan=await db.prepare("SELECT id,member_id AS memberId,principal_minor AS principalMinor,currency,disbursement_date AS disbursementDate,(SELECT created_at FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=loans.id) AS sourceVoidedAt FROM loans WHERE id=?").bind(loanId).first<{id:string;memberId:string;principalMinor:number;currency:string;disbursementDate:string;sourceVoidedAt:string|null}>()
 if(!loan) throw new Error('Loan not found')
 if(v.expectedMemberId!==loan.memberId || v.expectedPrincipalMinor!==loan.principalMinor || v.expectedCurrency!==loan.currency || v.expectedDate!==loan.disbursementDate) throw new Error('Loan details changed since review; review again')
 const findReversal=()=>db.prepare("SELECT r.id FROM journal_entries j JOIN journal_entries r ON r.reverses_entry_id=j.id AND r.status='posted' WHERE j.source_type='loan-disbursement' AND j.source_id=? AND j.status='posted'").bind(loanId).first<{id:string}>()
 const opening=await db.prepare('SELECT journal_id AS journalId FROM loan_openings WHERE loan_id=?').bind(loanId).first<{journalId:string}>()
 const prior=await db.prepare("SELECT description FROM journal_entries WHERE source_type='loan-disbursement' AND source_id=? AND status='posted'").bind(loan.id).first<{description:string}>()
 if(!prior&&opening) throw new Error('Loan has a brought-forward opening; use opening correction')
 if(!prior&&loan.sourceVoidedAt) throw new Error('Loan not found')
 const route=v.dispatchRoute
 if(!prior&&(typeof route!=='string'||!['equity','other-bank','mobile-money','cash','historical-unknown'].includes(route)))throw new Error('Declare the payment route before posting')
 if(typeof route==='string'&&loan.disbursementDate>='2025-09-28'&&(route==='cash'||route==='historical-unknown'))throw new Error('The current protocol does not allow cash or an unknown payment route')
 const lengthId=(s:string)=>`${Array.from(s).length}:${s}`
 const description=prior?.description ?? `Loan principal disbursement ${lengthId(loan.id)} member ${lengthId(loan.memberId)}`
 const posted=await postJournal(db,actor,{currency:loan.currency,effectiveDate:loan.disbursementDate,description,sourceType:'loan-disbursement',sourceId:loan.id,reversesEntryId:null,lines:[{accountId:receivable,side:'debit',amountMinor:loan.principalMinor},{accountId:cash,side:'credit',amountMinor:loan.principalMinor}]},!prior&&typeof route==='string'?entryId=>[db.prepare('INSERT INTO loan_dispatch_declarations(journal_id,loan_id,route,declared_by) VALUES(?,?,?,?)').bind(entryId,loan.id,route,actor)]:undefined)
 const declaration=await db.prepare("SELECT route FROM loan_dispatch_declarations WHERE journal_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(posted.id,actor).first<{route:string}>()
 if(declaration ? declaration.route!==route : route!=null&&route!=='')throw new Error('Disbursement route differs from the recorded declaration')
 const reversal=await findReversal()
 const state=await db.prepare("SELECT (SELECT created_at FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=loans.id) AS sourceVoidedAt FROM loans WHERE id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(loanId,actor).first<{sourceVoidedAt:string|null}>()
 if(!state)throw new Error('Journal not confirmed')
 return {...posted,active:reversal===null&&state.sourceVoidedAt===null,reversalId:reversal?.id??null,sourceVoidedAt:state.sourceVoidedAt}
}

/** Exact correction of the original journal. Reposting remains unavailable. */
export async function reverseLoanDisbursement(db:D1Database,actor:string|null,input:unknown) {
 await requireAdmin(db,actor)
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid reversal')
 const v=input as Record<string,unknown>,loanId=id(v.loanId)
 if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450)throw new Error('Invalid reversal reason')
 const original=await db.prepare("SELECT id,currency FROM journal_entries WHERE source_type='loan-disbursement' AND source_id=? AND status='posted'").bind(loanId).first<{id:string;currency:string}>()
 if(!original)throw new Error('Posted loan journal not found')
 const lines=(await db.prepare('SELECT account_id AS accountId,side,amount_minor AS amountMinor FROM journal_lines WHERE entry_id=?').bind(original.id).all<{accountId:string;side:'debit'|'credit';amountMinor:number}>()).results
 return postJournal(db,actor,{currency:original.currency,effectiveDate:v.effectiveDate,description:`Loan disbursement reversal: ${v.reason.trim()}`,sourceType:'loan-disbursement-reversal',sourceId:original.id,reversesEntryId:original.id,lines:lines.map(line=>({...line,side:line.side==='debit'?'credit':'debit'}))})
}
