import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { configureLoanBilling, previewLoanBilling, commitLoanBilling } from '../../src/server/loan-billing/service.ts'
import { previewBillingCorrection, correctBillingEvent } from '../../src/server/loan-billing-corrections/service.ts'

function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1),('x','User','b@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u');
 INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan','m',1000000,'UGX','2026-01-04','terms','u');
 INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('principal','2','Principal','UGX'),('receivable','3','Receivable','UGX'),('income','4','Income','UGX'),('unapplied','5','Unapplied','UGX');
 INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('disb','UGX','2026-01-04','Loan principal disbursement 4:loan member 1:m','loan-disbursement','loan','u');
 INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('dl1','disb','principal','debit',1000000),('dl2','disb','cash','credit',1000000); UPDATE journal_entries SET status='posted' WHERE id='disb';`)
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const db={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){return sql.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:sql.prepare(this.query).all(...this.values as never[])}}}},async batch(s:Stmt[]){sql.exec('BEGIN');try{const results=s.map(x=>{const stmt=sql.prepare(x.query);return {results:stmt.columns().length?stmt.all(...x.values as never[]):(stmt.run(...x.values as never[]),[])}});sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database
 return {sql,db}
}
const config={loanId:'loan',expectedPrincipalMinor:'1000000',expectedCurrency:'UGX',expectedDisbursementDate:'2026-01-04',expectedOriginalTerms:'terms',rateBasisPoints:200,periodDays:60,requestKey:'config'}
async function correction(db:D1Database,eventId:string,key:string){const p=await previewBillingCorrection(db,'u',{eventId});return {eventId,requestKey:key,reason:'Wrong allocation',expectedEventDate:p.event.eventDate,expectedRevision:p.revision,periodOpenConfirmed:true}}


import { refundUnappliedReceipt, reverseUnappliedRefund, listUnappliedReceipts } from '../../src/server/unapplied-receipts/service.ts'

test('refund is balanced and idempotent; correction requires refund reversal',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 sql.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-01-14',1100000,'u')")
 const p=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-01-14',repaymentId:'r'})
 const event=await commitLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-01-14',repaymentId:'r',cashAccountId:'cash',principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',unappliedAccountId:'unapplied',expectedRevision:p.revision,expectedTotalInterestMinor:p.result.totalInterestMinor,expectedAccruedMinor:p.accruedMinor,expectedInterestMinor:p.interestMinor,expectedPrincipalMinor:p.principalMinor,expectedUnappliedMinor:p.unappliedMinor,requestKey:'post'})
 assert.equal(p.unappliedMinor,'80000')
 const input={eventId:event.id,amountMinor:'50000',effectiveDate:'2026-01-15',cashAccountId:'cash',reason:'Return excess',requestKey:'refund'}
 await assert.rejects(refundUnappliedReceipt(db,'x',input),/unauthorized/i)
 const refund=await refundUnappliedReceipt(db,'u',input);assert.equal((await refundUnappliedReceipt(db,'u',input)).id,refund.id)
 const lines=sql.prepare("SELECT side,account_id,amount_minor FROM journal_lines WHERE entry_id=? ORDER BY side").all(refund.journalId).map(x=>({...x}));assert.deepEqual(lines,[{side:'credit',account_id:'cash',amount_minor:50000},{side:'debit',account_id:'unapplied',amount_minor:50000}])
 assert.equal((await listUnappliedReceipts(db,'u')).events[0].refundedMinor,'50000')
 await assert.rejects(refundUnappliedReceipt(db,'u',{...input,amountMinor:'40000',requestKey:'too-much'}))
 const correctionInput=await correction(db,event.id,'undo');await assert.rejects(correctBillingEvent(db,'u',correctionInput),/refund/i)
 const reverse={refundId:refund.id,effectiveDate:'2026-01-15',reason:'Fix refund',requestKey:'reverse',periodOpenConfirmed:true};await assert.rejects(reverseUnappliedRefund(db,'u',{...reverse,periodOpenConfirmed:false}),/period/i);await assert.rejects(reverseUnappliedRefund(db,'u',{...reverse,effectiveDate:'2026-01-16'}));const reversed=await reverseUnappliedRefund(db,'u',reverse);assert.equal((await reverseUnappliedRefund(db,'u',reverse)).id,reversed.id)
 assert.equal((await listUnappliedReceipts(db,'u')).events[0].refundedMinor,'0')
 await correctBillingEvent(db,'u',correctionInput);sql.close()
})

test('write boundary rejects a raced refund or revoked administrator without a partial journal',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 sql.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-01-14',1100000,'u')")
 const p=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-01-14',repaymentId:'r'})
 const event=await commitLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-01-14',repaymentId:'r',cashAccountId:'cash',principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',unappliedAccountId:'unapplied',expectedRevision:p.revision,expectedTotalInterestMinor:p.result.totalInterestMinor,expectedAccruedMinor:p.accruedMinor,expectedInterestMinor:p.interestMinor,expectedPrincipalMinor:p.principalMinor,expectedUnappliedMinor:p.unappliedMinor,requestKey:'post'})
 const input={eventId:event.id,amountMinor:'80000',effectiveDate:'2026-01-15',cashAccountId:'cash',reason:'Return excess',requestKey:'refund'}
 let fired=false;const racing={prepare:db.prepare.bind(db),async batch(statements:Parameters<D1Database['batch']>[0]){if(!fired){fired=true;await refundUnappliedReceipt(db,'u',{...input,requestKey:'other'})}return db.batch(statements)}} as D1Database
 await assert.rejects(refundUnappliedReceipt(racing,'u',input),/refund unavailable/i)
 assert.equal((sql.prepare("SELECT count(*) n FROM unapplied_refunds").get() as {n:number}).n,1)
 const before=(sql.prepare("SELECT count(*) n FROM journal_entries").get() as {n:number}).n
 let revoked=false;const demoted={prepare:db.prepare.bind(db),async batch(statements:Parameters<D1Database['batch']>[0]){if(!revoked){revoked=true;sql.exec("DELETE FROM app_user_roles WHERE user_id='u'")}return db.batch(statements)}} as D1Database
 await assert.rejects(reverseUnappliedRefund(demoted,'u',{refundId:(await listUnappliedReceipts(db,'u')).refunds[0].id,effectiveDate:'2026-01-15',reason:'Correct',requestKey:'reverse',periodOpenConfirmed:true}),/unavailable|unauthorized/i)
 assert.equal((sql.prepare("SELECT count(*) n FROM journal_entries").get() as {n:number}).n,before);sql.close()
})
