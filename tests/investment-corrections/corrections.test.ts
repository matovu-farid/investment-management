import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {test} from 'node:test'
import {postInvestmentCorrection,reverseInvestmentCorrection,listInvestmentCorrectionWork} from '../../src/server/investment-corrections/service.ts'
import {postInvestmentTransaction,reverseInvestmentTransaction} from '../../src/server/investment-posting/service.ts'
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec('CREATE TABLE investment_publications(valuation_id TEXT,withdrawn_at TEXT)')
 for(const f of ['0043_investment_source_voids.sql','0051_investment_posting.sql','0052_investment_corrections.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1),('x','Member','b@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap'); INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Asset','property','UGX','u'); INSERT INTO investment_transactions(id,investment_id,transaction_date,transaction_type,amount_minor,created_by) VALUES('t','i','2026-02-01','Rent',1000,'u'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('income','2','Income','UGX'),('other','3','Other','UGX'),('usd','4','Foreign','USD');`)
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 let revokeOnFind=0
 const adapter={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){if(this.query.includes('WHERE c.request_key=?')&&revokeOnFind>0&&--revokeOnFind===0)db.exec("DELETE FROM app_user_roles WHERE user_id='u'");return db.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.query).all(...this.values as never[])}}}},async batch(s:Stmt[]){db.exec('BEGIN');try{const out=s.map(x=>({results:db.prepare(x.query).all(...x.values as never[])}));db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}} as unknown as D1Database
 return {db,adapter,revokeAtFind:(n:number)=>{revokeOnFind=n}}
}
const original={transactionId:'t',debitAccountId:'cash',creditAccountId:'income',expectedInvestmentId:'i',expectedDate:'2026-02-01',expectedType:'Rent',expectedAmountMinor:1000,expectedCurrency:'UGX'}
const key='123e4567-e89b-42d3-a456-426614174000'
test('investment correction history uses the Kampala business date at midnight',async()=>{
 const {db,adapter}=fixture()
 const at=(instant:string)=>new Proxy(adapter,{get(target,property,receiver){if(property==='prepare')return (query:string)=>target.prepare(query.replace("date('now'",`date('${instant}'`));return Reflect.get(target,property,receiver)}})
 assert.equal((await listInvestmentCorrectionWork(at('2026-01-14 20:59:59'),'u')).asOfDate,'2026-01-14')
 assert.equal((await listInvestmentCorrectionWork(at('2026-01-14 21:00:00'),'u')).asOfDate,'2026-01-15')
 await assert.rejects(listInvestmentCorrectionWork(at('2026-01-14 21:00:00'),'x'),/unauthorized/i)
 db.close()
})
test('replaces a reversed journal with reviewed accounts and preserves history across retries and reversals',async()=>{
 const {db,adapter}=fixture();const old=await postInvestmentTransaction(adapter,'u',original);const rev=await reverseInvestmentTransaction(adapter,'u',{transactionId:'t',effectiveDate:'2026-03-01',reason:'Incorrect mapping'})
 const input={...original,creditAccountId:'other',predecessorReversalId:rev.id,requestKey:key,date:'2026-03-02'}
 await assert.rejects(postInvestmentCorrection(adapter,null,input),/unauthorized/i)
 await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,date:'2026-02-28'}),/date/i)
 await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,creditAccountId:'usd'}),/currency/i)
 const corrected=await postInvestmentCorrection(adapter,'u',input);assert.equal(corrected.active,true)
 assert.equal((await postInvestmentCorrection(adapter,'u',input)).journalId,corrected.journalId)
 await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,creditAccountId:'income'}),/different/i)
 const work=await listInvestmentCorrectionWork(adapter,'u');assert.equal(work.versions.length,2);assert.equal(work.versions.find(v=>v.journalId===old.id)?.hasSuccessor,1)
 assert.throws(()=>db.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','t','bad','v','u')"),/reversed/i)
 const cr=await reverseInvestmentCorrection(adapter,'u',{journalId:corrected.journalId,date:'2026-04-01',reason:'Corrected again'});assert.equal((await postInvestmentCorrection(adapter,'u',input)).active,false)
 const next={...input,predecessorReversalId:cr.id,requestKey:'123e4567-e89b-42d3-a456-426614174001',date:'2026-04-02'}
 const competing={...next,requestKey:'123e4567-e89b-42d3-a456-426614174002'}
 const outcomes=await Promise.allSettled([postInvestmentCorrection(adapter,'u',next),postInvestmentCorrection(adapter,'u',competing)])
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1)
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,1)
 assert.equal((db.prepare('SELECT count(*) n FROM investment_journal_corrections').get() as {n:number}).n,2)
 db.close()
})
test('void and replacement serialize at database boundary and future reversal does not permit void',async()=>{
 const {db,adapter}=fixture();await postInvestmentTransaction(adapter,'u',original);const rev=await reverseInvestmentTransaction(adapter,'u',{transactionId:'t',effectiveDate:'2026-03-01',reason:'Correction'});const input={...original,predecessorReversalId:rev.id,requestKey:key,date:'2026-03-02'}
 let inject=false;const race={prepare:adapter.prepare.bind(adapter),async batch(s:Parameters<D1Database['batch']>[0]){if(!inject){inject=true;db.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','t','bad','v','u')")}return adapter.batch(s)}} as D1Database
 await assert.rejects(postInvestmentCorrection(race,'u',input),/void/i)
 assert.equal((db.prepare('SELECT count(*) n FROM investment_journal_corrections').get() as {n:number}).n,0);db.close()
})
test('replacement validates reviewed facts, predecessor, chronology and future-effective reversal before void',async()=>{
 const {db,adapter}=fixture();await postInvestmentTransaction(adapter,'u',original);const rev=await reverseInvestmentTransaction(adapter,'u',{transactionId:'t',effectiveDate:'2026-03-01',reason:'Correction'});const input={...original,predecessorReversalId:rev.id,requestKey:key,date:'2026-03-02'}
 await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,expectedAmountMinor:1}),/changed/i)
 await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,predecessorReversalId:'missing'}),/predecessor/i)
 const corrected=await postInvestmentCorrection(adapter,'u',input)
 await reverseInvestmentCorrection(adapter,'u',{journalId:corrected.journalId,date:'9999-01-01',reason:'Future reversal'})
 assert.throws(()=>db.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','t','bad','v','u')"),/reversed/i)
 db.close()
})
test('linked draft correction metadata cannot be edited to bypass source checks',async()=>{
 const {db,adapter}=fixture();await postInvestmentTransaction(adapter,'u',original);const rev=await reverseInvestmentTransaction(adapter,'u',{transactionId:'t',effectiveDate:'2026-03-01',reason:'Correction'})
 db.prepare("INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('draft','UGX','2026-03-02','test','investment-transaction-correction','key','u')").run()
 db.prepare("INSERT INTO investment_journal_corrections(id,transaction_id,journal_id,predecessor_reversal_id,created_by,request_key) VALUES('c','t','draft',?,'u','key')").run(rev.id)
 assert.throws(()=>db.exec("UPDATE journal_entries SET source_type='manual' WHERE id='draft'"),/immutable/i)
 assert.throws(()=>db.exec("UPDATE journal_entries SET status='posted' WHERE id='draft'"),/match active source/i)
 assert.throws(()=>db.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','t','bad','v','u')"),/reversed/i)
 db.close()
})
test('administrator revoked between authorization and read receives no snapshot',async()=>{
 const {db,adapter}=fixture();const racing={prepare:adapter.prepare.bind(adapter),async batch(s:Parameters<D1Database['batch']>[0]){db.exec("DELETE FROM app_user_roles WHERE user_id='u'");return adapter.batch(s)}} as D1Database
 await assert.rejects(listInvestmentCorrectionWork(racing,'u'),/unauthorized/i)
 db.close()
})

test('investment correction retry does not return a journal after administrator revocation',async()=>{
 const {db,adapter,revokeAtFind}=fixture();await postInvestmentTransaction(adapter,'u',original);const rev=await reverseInvestmentTransaction(adapter,'u',{transactionId:'t',effectiveDate:'2026-03-01',reason:'Correction'});const input={...original,predecessorReversalId:rev.id,requestKey:key,date:'2026-03-02'}
 const result=await postInvestmentCorrection(adapter,'u',input)
 for(const read of [1,2]){revokeAtFind(read);await assert.rejects(postInvestmentCorrection(adapter,'u',input));db.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap')")}
 assert.equal((await postInvestmentCorrection(adapter,'u',input)).journalId,result.journalId)
 db.close()
})

test('exact correction retry confirms after reversal and source void, changed details rejected',async()=>{
 const {db,adapter}=fixture();db.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('x','admin','bootstrap')");await postInvestmentTransaction(adapter,'u',original);const rev=await reverseInvestmentTransaction(adapter,'u',{transactionId:'t',effectiveDate:'2026-03-01',reason:'Correction'});const input={...original,predecessorReversalId:rev.id,requestKey:key,date:'2026-03-02'}
 const result=await postInvestmentCorrection(adapter,'u',input);const reversal=await reverseInvestmentCorrection(adapter,'u',{journalId:result.journalId,date:'2026-03-03',reason:'Correction'});db.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','t','bad','v','u')")
 const retry=await postInvestmentCorrection(adapter,'u',input);assert.equal(retry.journalId,result.journalId);assert.equal(retry.active,false);assert.equal(retry.reversalId,reversal.id);assert.ok(retry.sourceVoidedAt);await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,creditAccountId:'other'}),/different/i);await assert.rejects(postInvestmentCorrection(adapter,'x',input),/different/i);await assert.rejects(postInvestmentCorrection(adapter,'u',{...input,requestKey:'123e4567-e89b-42d3-a456-426614174009'}),/changed/i);assert.equal((db.prepare('SELECT count(*) n FROM investment_journal_corrections').get() as {n:number}).n,1);db.close()
})
