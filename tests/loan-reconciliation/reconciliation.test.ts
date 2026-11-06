import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { loanReconciliation } from '../../src/server/loan-reconciliation/service.ts'

function setup() {
 const sql = new DatabaseSync(':memory:')
 sql.exec(`CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE app_user_roles(user_id TEXT,role TEXT); CREATE TABLE members(id TEXT,full_name TEXT); CREATE TABLE loans(id TEXT,member_id TEXT,principal_minor INTEGER,currency TEXT,disbursement_date TEXT); CREATE TABLE loan_repayments(id TEXT,loan_id TEXT,amount_minor INTEGER,payment_date TEXT); CREATE TABLE journal_entries(id TEXT,source_type TEXT,source_id TEXT,effective_date TEXT,currency TEXT,status TEXT,reverses_entry_id TEXT); CREATE TABLE journal_corrections(journal_id TEXT,source_kind TEXT,source_id TEXT,predecessor_reversal_id TEXT); INSERT INTO app_user_roles VALUES('admin','admin'),('member','member'); INSERT INTO members VALUES('m','Member'); INSERT INTO loans VALUES('l','m',1000,'UGX','2026-01-01'),('empty','m',20,'USD','2026-01-02'); INSERT INTO loan_repayments VALUES('r','l',300,'2026-02-01'); INSERT INTO journal_entries VALUES('original','loan-disbursement','l','2026-01-01','UGX','posted',NULL),('reversal','loan-disbursement-reversal','original','2026-02-01','UGX','posted','original'),('replacement','loan-disbursement-correction','key','2026-02-02','UGX','posted',NULL),('receipt','loan-repayment','r','2026-02-01','UGX','posted',NULL),('orphan','loan-repayment','missing','2026-01-01','UGX','posted',NULL); INSERT INTO journal_corrections VALUES('replacement','loan','l','reversal');`)
 sql.exec(`CREATE TABLE journal_lines(entry_id TEXT,side TEXT,amount_minor INTEGER); INSERT INTO journal_lines VALUES('original','debit',1000),('original','credit',1000),('replacement','debit',1000),('replacement','credit',1000),('receipt','debit',300),('receipt','credit',300),('orphan','debit',3),('orphan','credit',3);`)
 type Statement={query:string;values:unknown[];bind:(...v:unknown[])=>Statement;all:()=>Promise<{results:unknown[]}>}
 const db={prepare(query:string):Statement{return {query,values:[],bind(...v){this.values=v;return this},async all(){return {results:sql.prepare(this.query).all(...this.values as never[])}}}},async batch(stmts:Statement[]){return Promise.all(stmts.map(s=>s.all()))}} as unknown as D1Database
 return {db,sql}
}
test('summarizes each source and the original, reversal and replacement chain without calculating balances',async()=>{
 const {db}=setup(), report=await loanReconciliation(db,'admin')
 const loan=report.sources.find(s=>s.kind==='loan'&&s.sourceId==='l')!
 assert.equal(loan.status,'active');assert.equal(loan.amountMinor,'1000');assert.equal(loan.currency,'UGX');assert.equal(loan.versions.length,2);assert.equal(loan.versions.find(v=>v.journalId==='original')?.reversalId,'reversal');assert.equal(loan.versions.find(v=>v.journalId==='replacement')?.reversalId,null)
 assert.equal(report.sources.find(s=>s.sourceId==='r')?.status,'active');assert.equal(report.sources.find(s=>s.sourceId==='empty')?.status,'unposted');assert.ok(report.anomalies.some(a=>a.journalId==='orphan'))
})
test('rejects non-admin and reports reversed and inconsistent source links accurately',async()=>{
 const {db,sql}=setup();await assert.rejects(loanReconciliation(db,null),/unauthorized/i);await assert.rejects(loanReconciliation(db,'member'),/unauthorized/i)
 sql.exec("INSERT INTO journal_entries VALUES('r2','source-correction-reversal','replacement','2026-03-01','UGX','posted','replacement'); UPDATE journal_entries SET currency='USD' WHERE id='receipt'")
 const report=await loanReconciliation(db,'admin');assert.equal(report.sources.find(s=>s.sourceId==='l')?.status,'all reversed');assert.equal(report.sources.find(s=>s.sourceId==='r')?.status,'review required')
})

test('retains source void details and journal history in reconciliation',async()=>{const {db,sql}=setup();sql.exec("INSERT INTO loan_source_voids VALUES ('repayment','r','wrong record','2026-11-05 12:00:00')");const source=(await loanReconciliation(db,'admin')).sources.find(s=>s.sourceId==='r')!;assert.equal(source.voidedAt,'2026-11-05 12:00:00');assert.equal(source.voidReason,'wrong record');assert.equal(source.versions.length,1)})

test('flags voided sources with unreversed or later-reversed postings', async () => {
 const {db,sql}=setup()
 sql.exec("INSERT INTO loan_source_voids VALUES ('repayment','r','wrong record','2026-03-01 12:00:00')")
 let receipt=(await loanReconciliation(db,'admin')).sources.find(s=>s.sourceId==='r')!
 assert.equal(receipt.status,'review required')
 assert.ok(receipt.issues.some(i=>i.includes('voided') && i.includes('reversal')))
 sql.exec("INSERT INTO journal_entries VALUES('receipt-reversal','loan-repayment-reversal','receipt','2026-03-02','UGX','posted','receipt')")
 receipt=(await loanReconciliation(db,'admin')).sources.find(s=>s.sourceId==='r')!
 assert.equal(receipt.status,'review required')
 assert.ok(receipt.issues.some(i=>i.includes('voided') && i.includes('reversal')))
 sql.exec("UPDATE journal_entries SET effective_date='2026-03-01' WHERE id='receipt-reversal'")
 receipt=(await loanReconciliation(db,'admin')).sources.find(s=>s.sourceId==='r')!
 assert.equal(receipt.status,'all reversed')
})
