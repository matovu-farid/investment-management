import {postJournal} from '../accounting/posting.ts'
type Receipt={id:string;loanId:string;memberId:string;memberName:string;amountMinor:number;currency:string;paymentDate:string;journalId:string|null;reversalId:string|null}
type Account={id:string;code:string;name:string;currency:string}
type Line={entryId:string;accountCode:string;accountName:string;side:'debit'|'credit';amountMinor:number}
async function admin(db:D1Database,actor:string|null){if(!actor||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized')}
function id(v:unknown){if(typeof v!=='string'||!v.trim()||v.length>128)throw new Error('Invalid selection');return v.trim()}
export async function listRepaymentPosting(db:D1Database,actor:string|null){
 if(!actor)throw new Error('Unauthorized')
 const authority="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
 const [receipts,accounts,lines,permission]=await db.batch([
  db.prepare(`SELECT r.id,r.loan_id AS loanId,n.member_id AS memberId,m.full_name AS memberName,r.amount_minor AS amountMinor,n.currency,r.payment_date AS paymentDate,j.id AS journalId,(SELECT x.id FROM journal_entries x WHERE x.reverses_entry_id=j.id AND x.status='posted') AS reversalId FROM loan_repayments r JOIN loans n ON n.id=r.loan_id JOIN members m ON m.id=n.member_id LEFT JOIN journal_entries j ON j.source_type='loan-repayment' AND j.source_id=r.id AND j.status='posted' WHERE ${authority} AND NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE (v.source_kind='repayment' AND v.source_id=r.id) OR (v.source_kind='loan' AND v.source_id=n.id)) ORDER BY r.payment_date DESC,r.id`).bind(actor),
  db.prepare(`SELECT id,code,name,currency FROM ledger_accounts WHERE ${authority} ORDER BY code`).bind(actor),
  db.prepare(`SELECT j.id AS entryId,a.code AS accountCode,a.name AS accountName,l.side,l.amount_minor AS amountMinor FROM journal_entries j JOIN journal_lines l ON l.entry_id=j.id JOIN ledger_accounts a ON a.id=l.account_id WHERE ${authority} AND j.source_type='loan-repayment' AND j.status='posted' ORDER BY j.id,l.id`).bind(actor),
  db.prepare(`SELECT 1 WHERE ${authority}`).bind(actor),
 ])
 if(!permission.results.length)throw new Error('Unauthorized')
 return {receipts:receipts.results as Receipt[],accounts:accounts.results as Account[],lines:lines.results as Line[]}
}
export async function postRepayment(db:D1Database,actor:string|null,input:unknown){
 await admin(db,actor);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid selection');const v=input as Record<string,unknown>,repaymentId=id(v.repaymentId),cash=id(v.cashAccountId)
 if(!Array.isArray(v.credits)||v.credits.length<1||v.credits.length>99)throw new Error('Invalid credit splits')
 const credits=v.credits.map((raw:unknown)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid credit splits');const c=raw as Record<string,unknown>,accountId=id(c.accountId),amountMinor=c.amountMinor;if(accountId===cash||typeof amountMinor!=='number'||!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('Invalid credit splits');return {accountId,side:'credit' as const,amountMinor}})
 if(new Set(credits.map(c=>c.accountId)).size!==credits.length)throw new Error('Credit accounts must be distinct')
 const receipt=await db.prepare(`SELECT r.id,r.loan_id AS loanId,n.member_id AS memberId,r.amount_minor AS amountMinor,r.payment_date AS paymentDate,n.currency,(SELECT created_at FROM loan_source_voids v WHERE (v.source_kind='repayment' AND v.source_id=r.id) OR (v.source_kind='loan' AND v.source_id=n.id) ORDER BY v.created_at LIMIT 1) AS sourceVoidedAt FROM loan_repayments r JOIN loans n ON n.id=r.loan_id WHERE r.id=?`).bind(repaymentId).first<{id:string;loanId:string;memberId:string;amountMinor:number;paymentDate:string;currency:string;sourceVoidedAt:string|null}>();if(!receipt)throw new Error('Repayment not found')
 if(v.expectedAmountMinor!==receipt.amountMinor||v.expectedCurrency!==receipt.currency||v.expectedDate!==receipt.paymentDate||v.expectedLoanId!==receipt.loanId||v.expectedMemberId!==receipt.memberId)throw new Error('Repayment details changed since review')
 if(credits.reduce((sum,c)=>sum+BigInt(c.amountMinor),0n)!==BigInt(receipt.amountMinor))throw new Error('Credits must equal the recorded repayment')
 const reversal=()=>db.prepare("SELECT x.id FROM journal_entries j JOIN journal_entries x ON x.reverses_entry_id=j.id AND x.status='posted' WHERE j.source_type='loan-repayment' AND j.source_id=? AND j.status='posted'").bind(repaymentId).first<{id:string}>()
 const prior=await db.prepare("SELECT id FROM journal_entries WHERE source_type='loan-repayment' AND source_id=? AND status='posted'").bind(repaymentId).first<{id:string}>()
 if(!prior&&receipt.sourceVoidedAt)throw new Error('Repayment not found')
 const lengthId=(s:string)=>`${Array.from(s).length}:${s}`
 const result=await postJournal(db,actor,{currency:receipt.currency,effectiveDate:receipt.paymentDate,description:`Loan repayment ${lengthId(receipt.id)} loan ${lengthId(receipt.loanId)} member ${lengthId(receipt.memberId)}`,sourceType:'loan-repayment',sourceId:receipt.id,reversesEntryId:null,lines:[{accountId:cash,side:'debit',amountMinor:receipt.amountMinor},...credits]})
 const reversed=await reversal()
 const state=await db.prepare("SELECT (SELECT created_at FROM loan_source_voids v WHERE (v.source_kind='repayment' AND v.source_id=r.id) OR (v.source_kind='loan' AND v.source_id=r.loan_id) ORDER BY v.created_at LIMIT 1) AS sourceVoidedAt FROM loan_repayments r WHERE r.id=?").bind(repaymentId).first<{sourceVoidedAt:string|null}>();if(!state)throw new Error('Journal not confirmed')
 return {...result,active:reversed===null&&state.sourceVoidedAt===null,reversalId:reversed?.id??null,sourceVoidedAt:state.sourceVoidedAt}
}
export async function reverseRepayment(db:D1Database,actor:string|null,input:unknown){
 await admin(db,actor);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid reversal');const v=input as Record<string,unknown>,repaymentId=id(v.repaymentId);if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450)throw new Error('Invalid reversal reason')
 const original=await db.prepare("SELECT id,currency FROM journal_entries WHERE source_type='loan-repayment' AND source_id=? AND status='posted'").bind(repaymentId).first<{id:string;currency:string}>();if(!original)throw new Error('Posted repayment journal not found')
 const lines=(await db.prepare('SELECT account_id AS accountId,side,amount_minor AS amountMinor FROM journal_lines WHERE entry_id=?').bind(original.id).all<{accountId:string;side:'debit'|'credit';amountMinor:number}>()).results
 return postJournal(db,actor,{currency:original.currency,effectiveDate:v.effectiveDate,description:`Loan repayment reversal: ${v.reason.trim()}`,sourceType:'loan-repayment-reversal',sourceId:original.id,reversesEntryId:original.id,lines:lines.map(l=>({...l,side:l.side==='debit'?'credit':'debit'}))})
}
