import {postJournal} from '../accounting/posting.ts'

type Transaction = {id:string;investmentId:string;investmentName:string;transactionDate:string;transactionType:string;amountMinor:number;currency:string;reference:string|null;journalId:string|null;reversalId:string|null;reversalDate:string|null}
type Account = {id:string;code:string;name:string;currency:string}
type Line = {entryId:string;accountCode:string;accountName:string;side:'debit'|'credit';amountMinor:number}
async function admin(db:D1Database,actor:string|null){if(!actor||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized');return actor}
function id(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>128)throw new Error('Invalid selection');return value.trim()}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid request');return value as Record<string,unknown>}
export async function listInvestmentPosting(db:D1Database,actor:string|null){
 const user=await admin(db,actor)
 const [transactions,accounts,lines,authorized]=await db.batch([
  db.prepare(`SELECT t.id,t.investment_id AS investmentId,i.name AS investmentName,t.transaction_date AS transactionDate,t.transaction_type AS transactionType,t.amount_minor AS amountMinor,i.currency,t.reference,j.id AS journalId,(SELECT r.id FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted') AS reversalId,(SELECT r.effective_date FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted') AS reversalDate FROM investment_transactions t JOIN investments i ON i.id=t.investment_id LEFT JOIN journal_entries j ON j.source_type='investment-transaction' AND j.source_id=t.id AND j.status='posted' WHERE NOT EXISTS(SELECT 1 FROM investment_source_voids v WHERE v.source_kind='transaction' AND v.source_id=t.id) AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY t.transaction_date DESC,t.id`).bind(user),
  db.prepare("SELECT id,code,name,currency FROM ledger_accounts WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY code").bind(user),
  db.prepare("SELECT j.id AS entryId,a.code AS accountCode,a.name AS accountName,l.side,l.amount_minor AS amountMinor FROM journal_entries j JOIN journal_lines l ON l.entry_id=j.id JOIN ledger_accounts a ON a.id=l.account_id WHERE j.source_type='investment-transaction' AND j.status='posted' AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY j.id,l.id").bind(user),
  db.prepare("SELECT 1 AS ok WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(user),
 ])
 if(!authorized.results.length)throw new Error('Unauthorized')
 return {transactions:transactions.results as Transaction[],accounts:accounts.results as Account[],lines:lines.results as Line[]}
}
export async function postInvestmentTransaction(db:D1Database,actor:string|null,input:unknown){
 const user=await admin(db,actor);const v=object(input),transactionId=id(v.transactionId),debit=id(v.debitAccountId),credit=id(v.creditAccountId)
 if(debit===credit)throw new Error('Debit and credit accounts must be distinct')
 const t=await db.prepare(`SELECT t.id,t.investment_id AS investmentId,t.transaction_date AS transactionDate,t.transaction_type AS transactionType,t.amount_minor AS amountMinor,i.currency,(SELECT v.created_at FROM investment_source_voids v WHERE v.source_kind='transaction' AND v.source_id=t.id) AS sourceVoidedAt FROM investment_transactions t JOIN investments i ON i.id=t.investment_id WHERE t.id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(transactionId,user).first<Pick<Transaction,'id'|'investmentId'|'transactionDate'|'transactionType'|'amountMinor'|'currency'> & {sourceVoidedAt:string|null}>()
 if(!t)throw new Error('Active investment transaction not found')
 if(v.expectedInvestmentId!==t.investmentId||v.expectedDate!==t.transactionDate||v.expectedType!==t.transactionType||v.expectedAmountMinor!==t.amountMinor||v.expectedCurrency!==t.currency)throw new Error('Investment transaction changed since review')
 const prior=await db.prepare("SELECT id FROM journal_entries WHERE source_type='investment-transaction' AND source_id=? AND status='posted' AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(transactionId,user).first<{id:string}>()
 if(!prior&&t.sourceVoidedAt)throw new Error('Active investment transaction not found')
 const lengthId=(s:string)=>`${Array.from(s).length}:${s}`
 const result=await postJournal(db,user,{currency:t.currency,effectiveDate:t.transactionDate,description:`Investment transaction ${lengthId(t.id)} investment ${lengthId(t.investmentId)} type ${lengthId(t.transactionType)}`,sourceType:'investment-transaction',sourceId:t.id,reversesEntryId:null,lines:[{accountId:debit,side:'debit',amountMinor:t.amountMinor},{accountId:credit,side:'credit',amountMinor:t.amountMinor}]})
 const state=await db.prepare("SELECT (SELECT r.id FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted') AS reversalId,(SELECT v.created_at FROM investment_source_voids v WHERE v.source_kind='transaction' AND v.source_id=j.source_id) AS sourceVoidedAt FROM journal_entries j WHERE j.id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(result.id,user).first<{reversalId:string|null;sourceVoidedAt:string|null}>()
 if(!state)throw new Error('Journal not confirmed')
 return {...result,active:state.reversalId===null&&state.sourceVoidedAt===null,...state}
}
export async function reverseInvestmentTransaction(db:D1Database,actor:string|null,input:unknown){
 await admin(db,actor);const v=object(input),transactionId=id(v.transactionId)
 if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450)throw new Error('Invalid reversal reason')
 const original=await db.prepare("SELECT id,currency FROM journal_entries WHERE source_type='investment-transaction' AND source_id=? AND status='posted'").bind(transactionId).first<{id:string;currency:string}>();if(!original)throw new Error('Posted investment journal not found')
 const lines=(await db.prepare('SELECT account_id AS accountId,side,amount_minor AS amountMinor FROM journal_lines WHERE entry_id=?').bind(original.id).all<{accountId:string;side:'debit'|'credit';amountMinor:number}>()).results
 return postJournal(db,actor,{currency:original.currency,effectiveDate:v.effectiveDate,description:`Investment transaction reversal: ${v.reason.trim()}`,sourceType:'investment-transaction-reversal',sourceId:original.id,reversesEntryId:original.id,lines:lines.map(l=>({...l,side:l.side==='debit'?'credit':'debit'}))})
}
