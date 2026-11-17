import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { configureLoanBilling, cancelLoanBillingConfig, previewLoanBilling, commitLoanBilling } from '../../src/server/loan-billing/service.ts'
import { previewBillingCorrection, correctBillingEvent } from '../../src/server/loan-billing-corrections/service.ts'

function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0030_repayment_posting.sql'])sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec('CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_term_change_voids(term_change_id TEXT)')
 for(const f of ['0077_loan_billing.sql','0078_billing_corrections.sql','0079_loan_openings.sql','0081_billing_opening_state.sql','0082_billing_balance_publications.sql','0084_billing_rate_changes.sql','0085_billing_opening_cutoff_rate.sql','0086_billing_legacy_terms_review.sql'])sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1),('x','User','b@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u');
 INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan','m',1000000,'UGX','2026-01-04','terms','u');
 INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('principal','2','Principal','UGX'),('receivable','3','Receivable','UGX'),('income','4','Income','UGX');
 INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('disb','UGX','2026-01-04','disbursement','loan-disbursement','loan','u');
 INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('dl1','disb','principal','debit',1000000),('dl2','disb','cash','credit',1000000); UPDATE journal_entries SET status='posted' WHERE id='disb';`)
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const db={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){return sql.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:sql.prepare(this.query).all(...this.values as never[])}}}},async batch(s:Stmt[]){sql.exec('BEGIN');try{const results=s.map(x=>{const stmt=sql.prepare(x.query);return {results:stmt.columns().length?stmt.all(...x.values as never[]):(stmt.run(...x.values as never[]),[])}});sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database
 return {sql,db}
}
const config={loanId:'loan',expectedPrincipalMinor:'1000000',expectedCurrency:'UGX',expectedDisbursementDate:'2026-01-04',expectedOriginalTerms:'terms',rateBasisPoints:200,periodDays:60,requestKey:'config'}
async function post(db:D1Database,repaymentId:string,date:string,key:string){
 const p=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:date,repaymentId})
 return commitLoanBilling(db,'u',{loanId:'loan',asOfDate:date,repaymentId,cashAccountId:'cash',expectedRevision:p.revision,expectedTotalInterestMinor:p.result.totalInterestMinor,expectedAccruedMinor:p.accruedMinor,expectedInterestMinor:p.interestMinor,expectedPrincipalMinor:p.principalMinor,expectedUnappliedMinor:p.unappliedMinor,principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',requestKey:key})
}
async function correction(db:D1Database,eventId:string,key:string){const p=await previewBillingCorrection(db,'u',{eventId});return {eventId,requestKey:key,reason:'Wrong allocation',expectedEventDate:p.event.eventDate,expectedRevision:p.revision,periodOpenConfirmed:true}}

test('reverses both journals exactly, retries safely, and allows a reviewed repayment to be posted again',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 sql.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-03',110000,'u')")
 const first=await post(db,'r','2026-02-03','post-1'),input=await correction(db,first.id,'undo-1')
 await assert.rejects(correctBillingEvent(db,'x',input),/unauthorized|latest/i)
 await assert.rejects(correctBillingEvent(db,'u',{...input,periodOpenConfirmed:false}),/period/i)
 const undo=await correctBillingEvent(db,'u',input);assert.equal((await correctBillingEvent(db,'u',input)).id,undo.id)
 assert.throws(()=>sql.exec("UPDATE loan_repayments SET amount_minor=1 WHERE id='r'"),/immutable/i)
 assert.throws(()=>sql.exec("UPDATE loan_repayments SET payment_date='2026-02-04' WHERE id='r'"),/immutable/i)
 const reversals=sql.prepare("SELECT count(*) AS n FROM journal_entries WHERE source_type='loan-billing-reversal' AND status='posted'").get() as {n:number};assert.equal(reversals.n,2)
 const net=sql.prepare("SELECT account_id,sum(CASE side WHEN 'debit' THEN amount_minor ELSE -amount_minor END) n FROM journal_lines WHERE entry_id<>'disb' GROUP BY account_id").all() as {account_id:string;n:number}[];assert.ok(net.every(x=>x.n===0))
 const next=await post(db,'r','2026-02-03','post-2');assert.notEqual(next.id,first.id)
 assert.equal((sql.prepare("SELECT count(*) AS n FROM loan_billing_event_voids WHERE status='final'").get() as {n:number}).n,1);sql.close()
})

test('only latest active event can be reversed and a stale preview cannot be committed',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 sql.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r1','loan','2026-02-03',100,'u'),('r2','loan','2026-02-04',100,'u')")
 const first=await post(db,'r1','2026-02-03','post-1'),input=await correction(db,first.id,'undo-1')
 const second=await post(db,'r2','2026-02-04','post-2')
 await assert.rejects(correctBillingEvent(db,'u',input));await assert.rejects(previewBillingCorrection(db,'u',{eventId:first.id}),/latest/i)
 const latest=await correction(db,second.id,'undo-2');await correctBillingEvent(db,'u',latest)
 await assert.rejects(correctBillingEvent(db,'u',input),/changed|stale/i)
 const fresh=await correction(db,first.id,'undo-3');await correctBillingEvent(db,'u',fresh)
 assert.equal((sql.prepare("SELECT count(*) AS n FROM loan_billing_event_voids WHERE status='final'").get() as {n:number}).n,2);sql.close()
})

test('revoking administrator access before the write rolls back every reversal',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 sql.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-03',110000,'u')")
 const first=await post(db,'r','2026-02-03','post'),input=await correction(db,first.id,'undo')
 let injected=false
 const racing={prepare:db.prepare.bind(db),async batch(statements:Parameters<D1Database['batch']>[0]){
  if(!injected&&statements.some(s=>String((s as unknown as {query?:string}).query).startsWith('INSERT INTO loan_billing_event_voids'))){injected=true;sql.exec("DELETE FROM app_user_roles WHERE user_id='u'")}
  return db.batch(statements)
 }} as D1Database
 await assert.rejects(correctBillingEvent(racing,'u',input),/unauthorized|stale/i)
 assert.equal((sql.prepare('SELECT count(*) AS n FROM loan_billing_event_voids').get() as {n:number}).n,0)
 assert.equal((sql.prepare("SELECT count(*) AS n FROM journal_entries WHERE source_type='loan-billing-reversal'").get() as {n:number}).n,0)
 sql.close()
})

test('corrects an accrual-only event and permits revised terms after all active events are reversed',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 const p=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-02-03'})
 const event=await commitLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-02-03',expectedRevision:p.revision,expectedTotalInterestMinor:p.result.totalInterestMinor,expectedAccruedMinor:p.accruedMinor,expectedInterestMinor:'0',expectedPrincipalMinor:'0',expectedUnappliedMinor:'0',principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',requestKey:'accrual'})
 const undo=await correction(db,event.id,'undo');await correctBillingEvent(db,'u',undo)
 await cancelLoanBillingConfig(db,'u',{loanId:'loan',requestKey:'cancel',expectedConfigRequestKey:'config',reason:'Correct rate'})
 await configureLoanBilling(db,'u',{...config,rateBasisPoints:500,periodDays:180,requestKey:'config-new'})
 const revised=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-02-03'});assert.equal(revised.config.periodDays,180);assert.equal(revised.accruedMinor,'8333')
 assert.equal((sql.prepare("SELECT count(*) AS n FROM loan_billing_event_voids WHERE status='final' AND period_open_confirmed=1").get() as {n:number}).n,1);sql.close()
})

test('reverses a receipt, replaces terms, and replays the receipt with new interest without losing audit history',async()=>{
 const {sql,db}=fixture();await configureLoanBilling(db,'u',config)
 sql.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-03',110000,'u')")
 const oldPreview=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-02-03',repaymentId:'r'})
 const first=await post(db,'r','2026-02-03','post-old')
 const undo=await correction(db,first.id,'undo-old');await correctBillingEvent(db,'u',undo)
 const revisionAfterUndo=(sql.prepare("SELECT revision FROM loan_billing_revisions WHERE loan_id='loan'").get() as {revision:number}).revision
 await cancelLoanBillingConfig(db,'u',{loanId:'loan',requestKey:'cancel-old',expectedConfigRequestKey:'config',reason:'Revised terms'})
 await configureLoanBilling(db,'u',{...config,rateBasisPoints:500,periodDays:180,requestKey:'config-new'})
 const nextPreview=await previewLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-02-03',repaymentId:'r'})
 assert.ok(nextPreview.revision>revisionAfterUndo);assert.equal(nextPreview.interestMinor,'8333');assert.equal(nextPreview.principalMinor,'101667')
 await assert.rejects(commitLoanBilling(db,'u',{loanId:'loan',asOfDate:'2026-02-03',repaymentId:'r',cashAccountId:'cash',expectedRevision:oldPreview.revision,expectedTotalInterestMinor:oldPreview.result.totalInterestMinor,expectedAccruedMinor:oldPreview.accruedMinor,expectedInterestMinor:oldPreview.interestMinor,expectedPrincipalMinor:oldPreview.principalMinor,expectedUnappliedMinor:oldPreview.unappliedMinor,principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',requestKey:'stale'}))
 const second=await post(db,'r','2026-02-03','post-new');assert.notEqual(second.id,first.id)
 const events=sql.prepare('SELECT request_key,config_request_key FROM loan_billing_events ORDER BY rowid').all().map(row=>({...row}))
 assert.deepEqual(events,[{request_key:'post-old',config_request_key:'config'},{request_key:'post-new',config_request_key:'config-new'}])
 const imbalance=sql.prepare("SELECT entry_id,sum(CASE side WHEN 'debit' THEN amount_minor ELSE -amount_minor END) AS n FROM journal_lines GROUP BY entry_id HAVING n<>0").all();assert.equal(imbalance.length,0)
 assert.equal((sql.prepare("SELECT count(*) AS n FROM loan_billing_event_voids WHERE status='final' AND period_open_confirmed=1").get() as {n:number}).n,1);sql.close()
})
