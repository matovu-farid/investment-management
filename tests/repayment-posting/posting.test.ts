import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { listRepaymentPosting, postRepayment, reverseRepayment } from '../../src/server/repayment-posting/service.ts'

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0030_repayment_posting.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)")
 db.exec("CREATE TABLE loan_billing_configs(loan_id TEXT); CREATE TABLE loan_billing_events(id TEXT,repayment_id TEXT,repayment_journal_id TEXT); CREATE TABLE loan_billing_event_voids(event_id TEXT,status TEXT)")
 db.exec("CREATE TABLE loan_openings(loan_id TEXT)")
 const migration=readFileSync('migrations/0081_billing_opening_state.sql','utf8')
 const guard=migration.match(/CREATE TRIGGER opening_legacy_repayment_post_guard[\s\S]*?END;/)?.[0]
 if(!guard)throw new Error('Missing opening repayment guard')
 db.exec(guard)
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1),('x','Member','b@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan','m',10000,'UGX','2026-01-01','terms','u'); INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','loan','2026-02-01',1000,'u'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('principal','2','Principal','UGX'),('interest','3','Interest','UGX'),('usd','4','Foreign','USD');`)
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 let revokeAt='';const adapter={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){if(revokeAt&&this.query.startsWith(revokeAt)){revokeAt='';db.exec("DELETE FROM app_user_roles WHERE user_id='u'")}return db.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.query).all(...this.values as never[])}}}},async batch(s:Stmt[]){db.exec('BEGIN');try{const results=s.map(x=>{const statement=db.prepare(x.query);return {results:statement.columns().length?statement.all(...x.values as never[]):(statement.run(...x.values as never[]),[])}});db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}} as unknown as D1Database
 return {db,adapter,revokeOn:(q:string)=>{revokeAt=q}}
}
const input={repaymentId:'r',cashAccountId:'cash',credits:[{accountId:'principal',amountMinor:700},{accountId:'interest',amountMinor:300}],expectedAmountMinor:1000,expectedCurrency:'UGX',expectedDate:'2026-02-01',expectedLoanId:'loan',expectedMemberId:'m'}
test('posts reviewed recorded repayment and exact credit splits once, then reverses without reposting',async()=>{const {db,adapter}=fixture();const a=await postRepayment(adapter,'u',input);const b=await postRepayment(adapter,'u',input);assert.equal(a.id,b.id);assert.deepEqual(db.prepare('SELECT side,account_id,amount_minor FROM journal_lines ORDER BY account_id').all().map(x=>({...x})),[{side:'debit',account_id:'cash',amount_minor:1000},{side:'credit',account_id:'interest',amount_minor:300},{side:'credit',account_id:'principal',amount_minor:700}]);assert.throws(()=>db.exec("UPDATE loan_repayments SET amount_minor=1 WHERE id='r'"),/immutable/i);assert.throws(()=>db.exec("UPDATE loans SET currency='USD' WHERE id='loan'"),/immutable/i);const rev={repaymentId:'r',effectiveDate:'2026-03-01',reason:'Correction'};const r=await reverseRepayment(adapter,'u',rev);assert.equal((await reverseRepayment(adapter,'u',rev)).id,r.id);assert.equal((await postRepayment(adapter,'u',input)).active,false);db.exec("INSERT INTO loan_source_voids VALUES ('repayment','r','error','2026-11-05')");assert.equal((await postRepayment(adapter,'u',input)).active,false);await assert.rejects(postRepayment(adapter,'u',{...input,credits:[{accountId:'principal',amountMinor:1000}]}));db.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('x','admin','bootstrap')");await assert.rejects(postRepayment(adapter,'x',input),/different data/i);db.close()})
test('rejects unauthorized, stale, unbalanced, duplicate and currency-mismatched inputs without journals',async()=>{const {db,adapter}=fixture();await assert.rejects(postRepayment(adapter,'x',input),/unauthorized/i);await assert.rejects(postRepayment(adapter,'u',{...input,expectedAmountMinor:1}),/changed/i);await assert.rejects(postRepayment(adapter,'u',{...input,credits:[{accountId:'principal',amountMinor:1}]}));await assert.rejects(postRepayment(adapter,'u',{...input,credits:[{accountId:'cash',amountMinor:1000}]}));await assert.rejects(postRepayment(adapter,'u',{...input,credits:[{accountId:'usd',amountMinor:1000}]}));assert.equal((db.prepare('SELECT COUNT(*) n FROM journal_entries').get() as {n:number}).n,0);db.close()})
test('database rejects a balanced journal that mismatches its source repayment',()=>{const {db}=fixture();db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('j','UGX','2026-02-01','bad','loan-repayment','r','u');INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('a','j','cash','debit',5),('b','j','principal','credit',5)`);assert.throws(()=>db.exec("UPDATE journal_entries SET status='posted' WHERE id='j'"),/recorded repayment/i);db.close()})
test('rejects borrower change between review and database posting',async()=>{const {db,adapter}=fixture();db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES('other','2','Other','u')");let injected=false;const racing={prepare:adapter.prepare.bind(adapter),async batch(statements:Parameters<D1Database['batch']>[0]){if(!injected){injected=true;db.exec("UPDATE loans SET member_id='other' WHERE id='loan'")}return adapter.batch(statements)}} as D1Database;await assert.rejects(postRepayment(racing,'u',input),/recorded repayment/i);assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,0);db.close()})
test('changed splits cannot overwrite a posted receipt and reversal requires exact same retry details',async()=>{const {db,adapter}=fixture();await postRepayment(adapter,'u',input);await assert.rejects(postRepayment(adapter,'u',{...input,credits:[{accountId:'principal',amountMinor:1000}]}),/already used/i);const rev={repaymentId:'r',effectiveDate:'2026-03-01',reason:'Incorrect mapping'};await assert.rejects(reverseRepayment(adapter,'u',{...rev,effectiveDate:'2026-01-01'}),/before/i);await reverseRepayment(adapter,'u',rev);await assert.rejects(reverseRepayment(adapter,'u',{...rev,reason:'Changed'}),/already used/i);assert.equal((db.prepare("SELECT count(*) n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,2);db.close()})
test('retry detects reversal that commits between its first check and journal confirmation',async()=>{const {db,adapter}=fixture();await postRepayment(adapter,'u',input);let injected=false;const racing={prepare(sql:string){const stmt=adapter.prepare(sql);if(!sql.includes('SELECT id,currency,effective_date AS effectiveDate'))return stmt;return {bind(...values:unknown[]){const bound=stmt.bind(...values);return {async first(){const stale=await bound.first();if(!injected){injected=true;await reverseRepayment(adapter,'u',{repaymentId:'r',effectiveDate:'2026-03-01',reason:'Concurrent correction'})}return stale}}}}},batch:adapter.batch.bind(adapter)} as unknown as D1Database;assert.equal((await postRepayment(racing,'u',input)).active,false);assert.equal((db.prepare("SELECT count(*) n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,2);db.close()})

test('void repayments cannot be selected or posted',async()=>{const {db,adapter}=fixture();db.exec("INSERT INTO loan_source_voids VALUES ('repayment','r','error','2026-11-05')");assert.equal((await listRepaymentPosting(adapter,'u')).receipts.length,0);await assert.rejects(postRepayment(adapter,'u',input));db.close()})

test('active brought-forward opening requires billing setup; corrected opening restores legacy posting',async()=>{
 const {db,adapter}=fixture();db.exec("INSERT INTO loan_openings VALUES('loan')")
 assert.equal((await listRepaymentPosting(adapter,'u')).receipts[0].hasOpening,1)
 await assert.rejects(postRepayment(adapter,'x',input),/unauthorized/i)
 await assert.rejects(postRepayment(adapter,'u',input),/billing setup/i)
 assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,0)
 db.exec("DELETE FROM loan_openings WHERE loan_id='loan'")
 assert.equal((await listRepaymentPosting(adapter,'u')).receipts[0].hasOpening,0)
 assert.equal((await postRepayment(adapter,'u',input)).active,true);db.close()
})

test('database rejects legacy posting if an opening appears after review',async()=>{
 const {db,adapter}=fixture();let injected=false
 const racing={prepare:adapter.prepare.bind(adapter),async batch(statements:Parameters<D1Database['batch']>[0]){if(!injected){injected=true;db.exec("INSERT INTO loan_openings VALUES('loan')")}return adapter.batch(statements)}} as D1Database
 await assert.rejects(postRepayment(racing,'u',input),/billing setup/i)
 assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,0);db.close()
})

test('shows active billing posting, corrected receipt and subsequent repost without exposing legacy reversal',async()=>{
 const {db,adapter}=fixture()
 db.exec("INSERT INTO loan_billing_configs VALUES('loan'); INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('billing-j','UGX','2026-02-01','Billing repayment','loan-billing-repayment','event1','u'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('d','billing-j','cash','debit',1000),('c','billing-j','principal','credit',1000); UPDATE journal_entries SET status='posted' WHERE id='billing-j'; INSERT INTO loan_billing_events VALUES('event1','r','billing-j')")
 let r=(await listRepaymentPosting(adapter,'u')).receipts[0]
 assert.equal(r.journalId,'billing-j');assert.equal(r.journalKind,'billing');assert.equal(r.billingConfigured,1);assert.equal(r.reversalId,null)
 await assert.rejects(reverseRepayment(adapter,'u',{repaymentId:'r',effectiveDate:'2026-02-01',reason:'Correction'}),/not found/i)
 db.exec("INSERT INTO loan_billing_event_voids VALUES('event1','final')")
 r=(await listRepaymentPosting(adapter,'u')).receipts[0]
 assert.equal(r.journalId,null);assert.equal(r.journalKind,null);assert.equal(r.billingConfigured,1)
 db.exec("INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('billing-j2','UGX','2026-02-01','Reposted billing','loan-billing-repayment','event2','u'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('d2','billing-j2','cash','debit',1000),('c2','billing-j2','principal','credit',1000); UPDATE journal_entries SET status='posted' WHERE id='billing-j2'; INSERT INTO loan_billing_events VALUES('event2','r','billing-j2')")
 r=(await listRepaymentPosting(adapter,'u')).receipts[0]
 assert.equal(r.journalId,'billing-j2');assert.equal(r.journalKind,'billing');assert.equal((await listRepaymentPosting(adapter,'u')).receipts.length,1)
 db.close()
})

test('does not disclose repayment posting data when admin access is revoked before the read snapshot',async()=>{
 const {db,adapter}=fixture();let revoked=false
 const revoke=()=>{if(!revoked){db.exec("DELETE FROM app_user_roles WHERE user_id='u'");revoked=true}}
 const racing={prepare(sql:string){const stmt=adapter.prepare(sql);if(!sql.startsWith('SELECT role FROM app_user_roles'))return stmt;return {bind(...values:unknown[]){const bound=stmt.bind(...values);return {async first(){const result=await bound.first();revoke();return result}}}}},async batch(stmts:D1PreparedStatement[]){revoke();return adapter.batch(stmts)}} as unknown as D1Database
 await assert.rejects(listRepaymentPosting(racing,'u'),/unauthorized/i);db.close()
})

test('journal retry withholds final state after administrator revocation',async()=>{const {db,adapter,revokeOn}=fixture();const first=await postRepayment(adapter,'u',input);revokeOn('SELECT (SELECT created_at FROM loan_source_voids');await assert.rejects(postRepayment(adapter,'u',input));db.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap')");assert.equal((await postRepayment(adapter,'u',input)).id,first.id);db.close()})
