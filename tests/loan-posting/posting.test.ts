import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { listLoanPosting, postLoanDisbursement, reverseLoanDisbursement } from '../../src/server/loan-posting/service.ts'

function fixture(withGuard=true) {
 const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0017_loan_posting.sql',...(withGuard?['0032_disbursement_review_guard.sql']:[])]) db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)")
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','admin@example.test',1,1),('other','Member','other@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u');
 INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan1','m',10000,'UGX','2026-01-01','Recorded terms','u');
 INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','100','Cash','UGX'),('recv','200','Receivable','UGX'),('usd','300','USD cash','USD');`)
 type Statement={query:string;values:unknown[];bind:(...v:unknown[])=>Statement;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const adapter={prepare(query:string):Statement{return {query,values:[],bind(...v){this.values=v;return this},async first(){return db.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.query).all(...this.values as never[])}}}},async batch(statements:Statement[]){db.exec('BEGIN');try{const results=statements.map(s=>{const statement=db.prepare(s.query);return {results:statement.columns().length?statement.all(...s.values as never[]):(statement.run(...s.values as never[]),[])}});db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}} as unknown as D1Database
 return {db,adapter}
}
const selection={loanId:'loan1',receivableAccountId:'recv',cashAccountId:'cash',expectedPrincipalMinor:10000,expectedCurrency:'UGX',expectedDate:'2026-01-01',expectedMemberId:'m'}
test('posts recorded principal once and returns the same journal on retry',async()=>{
 const {db,adapter}=fixture(); const first=await postLoanDisbursement(adapter,'u',selection);const retry=await postLoanDisbursement(adapter,'u',selection)
 assert.equal(first.id,retry.id)
 assert.deepEqual(db.prepare('SELECT side,account_id,amount_minor FROM journal_lines ORDER BY side').all().map(x=>({...x})),[{side:'credit',account_id:'cash',amount_minor:10000},{side:'debit',account_id:'recv',amount_minor:10000}])
 assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,1);db.close()
})
test('rejects unauthorized, nonexistent, same account, wrong currency and changed retry without partial posting',async()=>{
 const {db,adapter}=fixture();await assert.rejects(postLoanDisbursement(adapter,'other',selection),/unauthorized/i)
 await assert.rejects(postLoanDisbursement(adapter,'u',{...selection,loanId:'missing'}),/loan/i)
 await assert.rejects(postLoanDisbursement(adapter,'u',{...selection,cashAccountId:'recv'}),/different/i)
 await assert.rejects(postLoanDisbursement(adapter,'u',{...selection,cashAccountId:'usd'}))
 assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,0)
 await postLoanDisbursement(adapter,'u',selection);await assert.rejects(postLoanDisbursement(adapter,'u',{...selection,cashAccountId:'usd'}))
 db.close()
})
test('database prevents mutation of posted loan principal, currency or disbursement date',async()=>{
 const {db,adapter}=fixture();await postLoanDisbursement(adapter,'u',selection)
 assert.throws(()=>db.exec("UPDATE loans SET principal_minor=1 WHERE id='loan1'"),/posted/i)
 assert.throws(()=>db.exec("UPDATE loans SET id='other' WHERE id='loan1'"),/posted/i)
 assert.throws(()=>db.exec("UPDATE loans SET disbursement_date='2026-02-01' WHERE id='loan1'"),/posted/i)
 db.close()
})

test('database rejects stale or tampered loan disbursement posting atomically',async()=>{
 const {db}=fixture()
 db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('j','UGX','2026-01-01','test','loan-disbursement','loan1','u');
 INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('d','j','recv','debit',1),('c','j','cash','credit',1);`)
 assert.throws(()=>db.exec("UPDATE journal_entries SET status='posted' WHERE id='j'"),/match recorded loan/i)
 assert.equal((db.prepare("SELECT status FROM journal_entries WHERE id='j'").get() as {status:string}).status,'draft')
 db.close()
})

test('reverses an incorrectly mapped disbursement exactly and never silently reposts',async()=>{
 const {db,adapter}=fixture(); await postLoanDisbursement(adapter,'u',selection)
 const reversal={loanId:'loan1',effectiveDate:'2026-02-01',reason:'Incorrect account'}
 await assert.rejects(reverseLoanDisbursement(adapter,'u',{...reversal,effectiveDate:'2025-12-31'}),/before/i)
 const reversed=await reverseLoanDisbursement(adapter,'u',reversal); const retry=await reverseLoanDisbursement(adapter,'u',reversal)
 assert.equal(reversed.id,retry.id)
 assert.deepEqual(db.prepare('SELECT side,account_id,amount_minor FROM journal_lines WHERE entry_id=? ORDER BY side').all(reversed.id).map(x=>({...x})),[{side:'credit',account_id:'recv',amount_minor:10000},{side:'debit',account_id:'cash',amount_minor:10000}])
 assert.equal((db.prepare('SELECT count(*) n FROM journal_entries WHERE status=\'posted\'').get() as {n:number}).n,2)
 assert.equal((await postLoanDisbursement(adapter,'u',selection)).active,false)
 db.exec("INSERT INTO loan_source_voids VALUES ('loan','loan1','error','2026-11-05')")
 assert.equal((await postLoanDisbursement(adapter,'u',selection)).active,false)
 await assert.rejects(postLoanDisbursement(adapter,'u',{...selection,cashAccountId:'usd'}))
 db.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('other','admin','bootstrap')")
 await assert.rejects(postLoanDisbursement(adapter,'other',selection),/different data/i)
 await assert.rejects(reverseLoanDisbursement(adapter,'u',{...reversal,reason:'Different'}),/already used/i)
 db.close()
})

test('does not post changed loan details after operator review',async()=>{
 const {db,adapter}=fixture()
 db.exec("UPDATE loans SET principal_minor=20000 WHERE id='loan1'")
 await assert.rejects(postLoanDisbursement(adapter,'u',selection),/changed/i)
 assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,0)
 db.close()
})

test('lists original journal lines needed to review an exact loan reversal',async()=>{
 const {db,adapter}=fixture();const posted=await postLoanDisbursement(adapter,'u',selection)
 const result=await listLoanPosting(adapter,'u')
 assert.equal(result.loans[0].journalId,posted.id)
 assert.deepEqual(result.journalLines.filter(line=>line.entryId===posted.id).map(line=>({side:line.side,code:line.accountCode,amount:line.amountMinor})).sort((a,b)=>a.side.localeCompare(b.side)),[{side:'credit',code:'100',amount:10000},{side:'debit',code:'200',amount:10000}])
 await assert.rejects(listLoanPosting(adapter,'other'),/unauthorized/i)
 db.close()
})

test('a retry does not report posted if a reversal commits after its initial check',async()=>{
 const {db,adapter}=fixture();await postLoanDisbursement(adapter,'u',selection)
 let injected=false
 const racing={
  prepare(sql:string){
   const stmt=adapter.prepare(sql)
   if(!sql.includes('SELECT id,currency,effective_date AS effectiveDate')) return stmt
   return {bind(...values:unknown[]){const bound=stmt.bind(...values);return {async first(){
    const stale=await bound.first()
    if(!injected){injected=true;await reverseLoanDisbursement(adapter,'u',{loanId:'loan1',effectiveDate:'2026-02-01',reason:'Concurrent correction'})}
    return stale
   }}}}
  },
  batch:adapter.batch.bind(adapter),
 } as unknown as D1Database
 assert.equal((await postLoanDisbursement(racing,'u',selection)).active,false)
 assert.equal((db.prepare("SELECT count(*) AS n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,2)
 db.close()
})


test('rejects borrower changes after review and immediately before journal batch',async()=>{
 const {db,adapter}=fixture()
 db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES('m2','2','Other member','u'); UPDATE loans SET member_id='m2' WHERE id='loan1'")
 await assert.rejects(postLoanDisbursement(adapter,'u',selection),/changed/i)
 db.exec("UPDATE loans SET member_id='m' WHERE id='loan1'")
 const racing={prepare:adapter.prepare.bind(adapter),async batch(stmts:unknown[]){db.exec("UPDATE loans SET member_id='m2' WHERE id='loan1'");return adapter.batch(stmts as D1PreparedStatement[])}} as unknown as D1Database
 await assert.rejects(postLoanDisbursement(racing,'u',selection),/match recorded loan|changed/i)
 assert.equal((db.prepare("SELECT count(*) AS n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,0)
 db.close()
})

test('database rechecks administrator permission at disbursement posting',async()=>{
 const {db,adapter}=fixture()
 const racing={prepare:adapter.prepare.bind(adapter),async batch(stmts:unknown[]){db.exec("DELETE FROM app_user_roles WHERE user_id='u'");return adapter.batch(stmts as D1PreparedStatement[])}} as unknown as D1Database
 await assert.rejects(postLoanDisbursement(racing,'u',selection),/unauthorized/i)
 assert.equal((db.prepare("SELECT count(*) AS n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,0)
 db.close()
})


test('legacy posted disbursement remains retryable after the new guard migration',async()=>{
 const {db,adapter}=fixture(false)
 db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('legacy','UGX','2026-01-01','Loan principal disbursement loan1','loan-disbursement','loan1','u');
 INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('ld','legacy','recv','debit',10000),('lc','legacy','cash','credit',10000);
 UPDATE journal_entries SET status='posted' WHERE id='legacy';`)
 db.exec(readFileSync('migrations/0032_disbursement_review_guard.sql','utf8'))
 const result=await postLoanDisbursement(adapter,'u',selection);assert.equal(result.id,'legacy')
 assert.equal((db.prepare("SELECT count(*) AS n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,1)
 db.close()
})

test('void sources cannot be selected or posted',async()=>{const {db,adapter}=fixture();db.exec("INSERT INTO loan_source_voids VALUES ('loan','loan1','error','2026-11-05')");assert.equal((await listLoanPosting(adapter,'u')).loans.length,0);await assert.rejects(postLoanDisbursement(adapter,'u',selection));db.close()})

test('does not disclose loan posting data when admin access is revoked before the read snapshot',async()=>{
 const {db,adapter}=fixture()
 let revoked=false
 const revoke=()=>{if(!revoked){db.exec("DELETE FROM app_user_roles WHERE user_id='u'");revoked=true}}
 const racing={
  prepare(sql:string){const stmt=adapter.prepare(sql);if(!sql.startsWith('SELECT role FROM app_user_roles'))return stmt;return {bind(...values:unknown[]){const bound=stmt.bind(...values);return {async first(){const result=await bound.first();revoke();return result}}}}},
  async batch(stmts:D1PreparedStatement[]){revoke();return adapter.batch(stmts)},
 } as unknown as D1Database
 await assert.rejects(listLoanPosting(racing,'u'),/unauthorized/i)
 db.close()
})
