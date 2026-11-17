import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { configureLoanBilling, previewLoanBilling, commitLoanBilling } from '../../src/server/loan-billing/service.ts'

function fixture(instant:string){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${f}`,'utf8').replaceAll("date('now'",`date('${instant}'`))
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

import {postLoanOpening} from '../../src/server/loan-openings/service.ts'
import {refundUnappliedReceipt,reverseUnappliedRefund} from '../../src/server/unapplied-receipts/service.ts'

function setInstant(sql:DatabaseSync,from:string,to:string){
 for(const name of ['loan_opening_insert_guard','billing_event_validate','unapplied_refund_insert','unapplied_refund_reversal_insert']){
  const row=sql.prepare('SELECT sql FROM sqlite_master WHERE type=\'trigger\' AND name=?').get(name) as {sql:string}
  assert.ok(row.sql.includes(from),`clock missing in ${name}`)
  sql.exec(`DROP TRIGGER ${name}`);sql.exec(row.sql.replaceAll(from,to))
 }
}

test('lending writes follow Kampala midnight while keeping journal and authority guards',async()=>{
 const before='2026-01-14 20:59:59',after='2026-01-14 21:00:00',date='2026-01-15'
 const {sql,db}=fixture(before)
 sql.exec("INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('opening-loan','m',1000000,'UGX','2026-01-04','terms','u')")
 const opening={loanId:'opening-loan',expectedMemberId:'m',expectedPrincipalMinor:'700000',expectedOriginalPrincipalMinor:'1000000',expectedCurrency:'UGX',openingDate:date,expectedDisbursementDate:'2026-01-04',receivableAccountId:'principal',clearingAccountId:'cash',source:'Reviewed opening',requestKey:'opening'}
 await assert.rejects(postLoanOpening(db,'u',opening),/future/i)
 await configureLoanBilling(db,'u',config)
 sql.exec(`INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','${date}',1100000,'u')`)
 const p=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:date,repaymentId:'r'})
 const posting={loanId:'loan',asOfDate:date,repaymentId:'r',cashAccountId:'cash',principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',unappliedAccountId:'unapplied',expectedRevision:p.revision,expectedTotalInterestMinor:p.result.totalInterestMinor,expectedAccruedMinor:p.accruedMinor,expectedInterestMinor:p.interestMinor,expectedPrincipalMinor:p.principalMinor,expectedUnappliedMinor:p.unappliedMinor,requestKey:'post'}
 await assert.rejects(commitLoanBilling(db,'u',posting),/future/i)
 setInstant(sql,before,after)
 await assert.rejects(postLoanOpening(db,'u',{...opening,openingDate:'2026-01-16'}),/future/i)
 await assert.rejects(postLoanOpening(db,'x',opening),/unauthorized/i)
 const opened=await postLoanOpening(db,'u',opening)
 const event=await commitLoanBilling(db,'u',posting)
 const refundInput={eventId:event.id,amountMinor:'50000',effectiveDate:date,cashAccountId:'cash',reason:'Return excess',requestKey:'refund'}
 await assert.rejects(refundUnappliedReceipt(db,'u',{...refundInput,effectiveDate:'2026-01-16',requestKey:'future'}),/unavailable/i)
 setInstant(sql,after,before)
 await assert.rejects(refundUnappliedReceipt(db,'u',refundInput),/unavailable/i)
 setInstant(sql,before,after)
 const refund=await refundUnappliedReceipt(db,'u',refundInput)
 const reverse={refundId:refund.id,effectiveDate:date,reason:'Correct refund',requestKey:'reverse',periodOpenConfirmed:true}
 setInstant(sql,after,before)
 await assert.rejects(reverseUnappliedRefund(db,'u',reverse),/unavailable/i)
 setInstant(sql,before,after)
 await assert.rejects(reverseUnappliedRefund(db,'u',{...reverse,periodOpenConfirmed:false}),/period/i)
 const reversed=await reverseUnappliedRefund(db,'u',reverse)
 for(const id of [opened.id,event.accrualJournalId,event.repaymentJournalId,refund.journalId,reversed.journalId].filter(Boolean)){
  const row=sql.prepare("SELECT sum(CASE side WHEN 'debit' THEN amount_minor ELSE -amount_minor END) AS net FROM journal_lines WHERE entry_id=?").get(id) as {net:number}
  assert.equal(row.net,0)
 }
 sql.close()
})
