import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { listLoanBilling, configureLoanBilling, cancelLoanBillingConfig, previewLoanBilling, commitLoanBilling, addBillingRateChange, voidBillingRateChange } from '../../src/server/loan-billing/service.ts'

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0030_repayment_posting.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec('CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_term_change_voids(term_change_id TEXT)')
 db.exec(readFileSync('migrations/0077_loan_billing.sql','utf8'))
 db.exec(readFileSync('migrations/0084_billing_rate_changes.sql','utf8'))
 db.exec("CREATE TABLE loan_billing_legacy_reviews(loan_id TEXT,config_request_key TEXT,mappings TEXT,status TEXT)")
 db.exec('CREATE TABLE loan_openings(loan_id TEXT,journal_id TEXT,receivable_account_id TEXT,principal_minor INTEGER,opening_date TEXT);CREATE TABLE loan_billing_opening_states(loan_id TEXT,opening_journal_id TEXT,rate_basis_points INTEGER,period_days INTEGER,cutoff_rate_basis_points INTEGER,cutoff_period_days INTEGER,interest_due_minor INTEGER,recognized_interest_minor INTEGER,minimum_assessed INTEGER,interest_receivable_account_id TEXT)')
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1),('x','User','b@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u');
 INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan','m',1000000,'UGX','2026-01-04','terms','u');
 INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('principal','2','Principal','UGX'),('receivable','3','Interest receivable','UGX'),('income','4','Income','UGX'),('unapplied','5','Unapplied','UGX'),('other','6','Other','UGX'),('usd','7','USD','USD');
 INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('disb','UGX','2026-01-04','disbursement','loan-disbursement','loan','u');
 INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('dl1','disb','principal','debit',1000000),('dl2','disb','cash','credit',1000000); UPDATE journal_entries SET status='posted' WHERE id='disb';`)
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const adapter={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){return db.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.query).all(...this.values as never[])}}}},async batch(s:Stmt[]){db.exec('BEGIN');try{const results=s.map(x=>{const stmt=db.prepare(x.query);return {results:stmt.columns().length?stmt.all(...x.values as never[]):(stmt.run(...x.values as never[]),[])}});db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}} as unknown as D1Database
 return {db,adapter}
}
const config={loanId:'loan',expectedPrincipalMinor:'1000000',expectedCurrency:'UGX',expectedDisbursementDate:'2026-01-04',expectedOriginalTerms:'terms',rateBasisPoints:200,periodDays:60,requestKey:'config'}

test('billing options use one guarded batch and enforce the current role',async()=>{
 const {db,adapter}=fixture();let batches=0
 const counted={prepare(q:string){if(q.startsWith('SELECT 1 ok WHERE'))throw new Error('unexpected role preflight');return adapter.prepare(q)},async batch(s:D1PreparedStatement[]){batches++;return adapter.batch(s)}} as D1Database
 const initial=await listLoanBilling(counted,'u');assert.equal(initial.loans.length,1);assert.deepEqual(initial.configs,[]);assert.deepEqual(initial.events,[]);assert.equal(batches,1)
 await assert.rejects(listLoanBilling(counted,null),/unauthorized/i);assert.equal(batches,1)
 await assert.rejects(listLoanBilling(counted,'x'),/unauthorized/i)
 const revoked={...counted,async batch(s:D1PreparedStatement[]){db.exec("DELETE FROM app_user_roles WHERE user_id='u'");return counted.batch(s)}} as D1Database
 await assert.rejects(listLoanBilling(revoked,'u'),/unauthorized/i);db.close()
})

test('reviewed rates alter later calculations, invalidate previews and preserve correction history',async()=>{
 const {db,adapter}=fixture();await configureLoanBilling(adapter,'u',config)
 const before=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03'})
 const change={loanId:'loan',expectedConfigRequestKey:'config',effectiveDate:'2026-01-19',rateBasisPoints:500,periodDays:180,reason:'Reviewed agreement',expectedRevision:before.revision,requestKey:'rate-one'}
 const saved=await addBillingRateChange(adapter,'u',change);assert.equal((await addBillingRateChange(adapter,'u',change)).id,saved.id)
 await assert.rejects(addBillingRateChange(adapter,'u',{...change,rateBasisPoints:400}),/different/i)
 await assert.rejects(commitLoanBilling(adapter,'u',{...commitInput(before),requestKey:'stale'}),/changed|stale/i)
 const after=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03'});assert.equal(after.result.totalInterestMinor,'9167')
 const correction={loanId:'loan',changeId:saved.id,reason:'Incorrect amendment',expectedRevision:after.revision,requestKey:'correct-rate'}
 assert.equal((await voidBillingRateChange(adapter,'u',correction)).changeId,saved.id);assert.equal((await voidBillingRateChange(adapter,'u',correction)).changeId,saved.id)
 assert.equal((await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03'})).result.totalInterestMinor,'10000')
 assert.equal((db.prepare('SELECT count(*) n FROM loan_billing_rate_change_voids').get() as {n:number}).n,1);db.close()
})

test('rate changes and corrections cannot reprice active journals, and revisions reject races',async()=>{
 const {db,adapter}=fixture();await configureLoanBilling(adapter,'u',config)
 const p=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03'});await commitLoanBilling(adapter,'u',{...commitInput(p),requestKey:'posted'})
 const current=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-04'})
 const earlier={loanId:'loan',expectedConfigRequestKey:'config',effectiveDate:'2026-02-03',rateBasisPoints:500,periodDays:180,reason:'Reviewed agreement',expectedRevision:current.revision,requestKey:'earlier'}
 await assert.rejects(addBillingRateChange(adapter,'u',earlier),/finalized|correction/i)
 const later={...earlier,effectiveDate:'2026-02-04',requestKey:'later'};const saved=await addBillingRateChange(adapter,'u',later)
 await assert.rejects(voidBillingRateChange(adapter,'u',{loanId:'loan',changeId:saved.id,reason:'Stale',expectedRevision:current.revision,requestKey:'stale-void'}),/stale/i)
 assert.equal((db.prepare('SELECT count(*) n FROM loan_billing_rate_change_voids').get() as {n:number}).n,0);db.close()
})

test('rate write atomically rejects a repayment inserted after review',async()=>{
 const {db,adapter}=fixture();await configureLoanBilling(adapter,'u',config)
 const p=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03'})
 const input={loanId:'loan',expectedConfigRequestKey:'config',effectiveDate:'2026-01-19',rateBasisPoints:500,periodDays:180,reason:'Reviewed agreement',expectedRevision:p.revision,requestKey:'race-rate'}
 await assert.rejects(addBillingRateChange(adapter,'x',input),/unauthorized/i)
 let injected=false
 const race={prepare:adapter.prepare.bind(adapter),async batch(statements:D1PreparedStatement[]){if(!injected&&statements.some(s=>(s as unknown as {query:string}).query.includes('INSERT INTO loan_billing_rate_changes'))){injected=true;db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('new','loan','2026-01-10',1,'u')")}return adapter.batch(statements)}} as D1Database
 await assert.rejects(addBillingRateChange(race,'u',input),/stale/i);assert.equal((db.prepare('SELECT count(*) n FROM loan_billing_rate_changes').get() as {n:number}).n,0);db.close()
})
function commitInput(p:Awaited<ReturnType<typeof previewLoanBilling>>,key='post'){return {loanId:'loan',asOfDate:p.target?.date??'2026-02-03',...(p.target?{repaymentId:p.target.id,cashAccountId:'cash'}:{}),expectedRevision:p.revision,expectedTotalInterestMinor:p.result.totalInterestMinor,expectedAccruedMinor:p.accruedMinor,expectedInterestMinor:p.interestMinor,expectedPrincipalMinor:p.principalMinor,expectedUnappliedMinor:p.unappliedMinor,principalAccountId:'principal',interestReceivableAccountId:'receivable',interestIncomeAccountId:'income',...(p.unappliedMinor!=='0'?{unappliedAccountId:'unapplied'}:{}),requestKey:key}}

test('posts accrual and interest-first repayment as balanced, atomic, idempotent journals',async()=>{
 const {db,adapter}=fixture();await configureLoanBilling(adapter,'u',config)
 db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-03',110000,'u')")
 const p=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03',repaymentId:'r'});assert.equal(p.accruedMinor,'10000');assert.equal(p.interestMinor,'10000');assert.equal(p.principalMinor,'100000')
 const input=commitInput(p);const saved=await commitLoanBilling(adapter,'u',input);assert.equal((await commitLoanBilling(adapter,'u',input)).id,saved.id)
 const rows=db.prepare("SELECT j.source_type,l.side,l.account_id,l.amount_minor FROM journal_entries j JOIN journal_lines l ON l.entry_id=j.id WHERE j.id<>'disb' ORDER BY j.source_type,l.side,l.account_id").all().map(x=>({...x}))
 assert.deepEqual(rows,[{source_type:'loan-billing-accrual',side:'credit',account_id:'income',amount_minor:10000},{source_type:'loan-billing-accrual',side:'debit',account_id:'receivable',amount_minor:10000},{source_type:'loan-billing-repayment',side:'credit',account_id:'principal',amount_minor:100000},{source_type:'loan-billing-repayment',side:'credit',account_id:'receivable',amount_minor:10000},{source_type:'loan-billing-repayment',side:'debit',account_id:'cash',amount_minor:110000}])
 await assert.rejects(commitLoanBilling(adapter,'u',{...input,expectedInterestMinor:'1'}));assert.throws(()=>db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('backdated','loan','2026-01-30',1,'u')"),/predates/i);db.close()
})

test('rejects stale preview and unauthorized or invalid accounts without partial journals',async()=>{
 const {db,adapter}=fixture();await assert.rejects(configureLoanBilling(adapter,'x',config),/unauthorized/i);await assert.rejects(configureLoanBilling(adapter,'u',{...config,expectedOriginalTerms:'wrong'}));await configureLoanBilling(adapter,'u',config)
 db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-03',110000,'u')")
 const p=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03',repaymentId:'r'});const input=commitInput(p)
 await assert.rejects(commitLoanBilling(adapter,'u',{...input,interestIncomeAccountId:'usd'}));assert.equal((db.prepare("SELECT COUNT(*) n FROM loan_billing_events").get() as {n:number}).n,0)
 db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('earlier','loan','2026-02-01',1,'u')")
 await assert.rejects(commitLoanBilling(adapter,'u',input));assert.equal((db.prepare("SELECT COUNT(*) n FROM journal_entries").get() as {n:number}).n,1);db.close()
})

test('revision guard rejects repayment inserted after final review and before atomic write',async()=>{
 const {db,adapter}=fixture();await configureLoanBilling(adapter,'u',config)
 db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-03',110000,'u')")
 const p=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03',repaymentId:'r'}),input=commitInput(p)
 let injected=false
 const race={prepare:adapter.prepare.bind(adapter),async batch(statements:D1PreparedStatement[]){if(!injected&&statements.some(s=>(s as unknown as {query:string}).query.startsWith('INSERT INTO loan_billing_events'))){injected=true;db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('earlier','loan','2026-02-01',1,'u')")}return adapter.batch(statements)}} as D1Database
 await assert.rejects(commitLoanBilling(race,'u',input),/stale|earlier/i)
 assert.equal((db.prepare('SELECT count(*) n FROM loan_billing_events').get() as {n:number}).n,0);assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,1);db.close()
})

test('cancels reviewed setup only before events and allows corrected setup with new key',async()=>{
 const {db,adapter}=fixture();await configureLoanBilling(adapter,'u',config)
 const cancel={loanId:'loan',requestKey:'cancel',expectedConfigRequestKey:'config',reason:'Wrong term'}
 const saved=await cancelLoanBillingConfig(adapter,'u',cancel);assert.equal((await cancelLoanBillingConfig(adapter,'u',cancel)).id,saved.id)
 await assert.rejects(configureLoanBilling(adapter,'u',config));await configureLoanBilling(adapter,'u',{...config,requestKey:'config-2',rateBasisPoints:500,periodDays:180})
 const p=await previewLoanBilling(adapter,'u',{loanId:'loan',asOfDate:'2026-02-03'});await commitLoanBilling(adapter,'u',{...commitInput(p),requestKey:'accrual'})
 await assert.rejects(cancelLoanBillingConfig(adapter,'u',{...cancel,requestKey:'cancel-2',expectedConfigRequestKey:'config-2'}));db.close()
})
