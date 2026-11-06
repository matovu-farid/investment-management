import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createBudgetRepository } from '../../src/server/budgets/repository.ts'
import { voidBudget, compareBudget } from '../../src/server/budgets/service.ts'

function setup() {
 const sql=new DatabaseSync(':memory:');sql.exec(`PRAGMA foreign_keys=ON; CREATE TABLE "user"(id TEXT PRIMARY KEY); INSERT INTO "user" VALUES('admin'),('other'); CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin'),('other','member'); CREATE TABLE investments(id TEXT PRIMARY KEY,name TEXT,currency TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_transactions(id TEXT,investment_id TEXT,transaction_date TEXT,transaction_type TEXT,amount_minor INTEGER,reference TEXT); CREATE TABLE cash_entries(id TEXT,entry_date TEXT,direction TEXT,amount_minor TEXT,currency TEXT,counterparty TEXT,reference TEXT,description TEXT); CREATE TABLE cash_entry_voids(entry_id TEXT); INSERT INTO investments VALUES('i','Bond','UGX'); INSERT INTO investment_transactions VALUES('t','i','2026-05-01','income',500,NULL);`)
 sql.exec(readFileSync('migrations/0028_budget_lines.sql','utf8'));sql.exec(readFileSync('migrations/0029_budget_voids.sql','utf8'))
 sql.exec(`INSERT INTO budget_lines(id,category,period_start,period_end,currency,amount_minor,source,created_by,request_key) VALUES('b','Income','2026-01-01','2026-12-31','UGX',1000,'source','admin','initial')`)
 const statement=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return statement(q,p)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}},async run(){return sql.prepare(q).run(...args as never[])}})
 const db={prepare:(q:string)=>statement(q),async batch(stmts:ReturnType<typeof statement>[]){return Promise.all(stmts.map(s=>s.all()))}} as unknown as D1Database
 return {sql,repo:createBudgetRepository(db)}
}
const key='96292f80-014c-4c0d-929c-ccfe956ba85c'
test('voided investment transaction disappears from budget comparison inputs',async()=>{
 const {sql,repo}=setup()
 assert.equal((await repo.list('admin')).transactions.length,1)
 sql.exec("INSERT INTO investment_source_voids VALUES('transaction','t','error','2026-11-05')")
 assert.equal((await repo.list('admin')).transactions.length,0)
 await assert.rejects(compareBudget(repo,'admin',{budgetId:'b',transactionIds:['t']}))
})
test('cash selection reads current void status and preserves large text amounts',async()=>{
 const {sql,repo}=setup()
 sql.exec("INSERT INTO cash_entries VALUES('t','2026-05-01','receipt','900719925474099199999','UGX','Counterparty',NULL,'Receipt')")
 const result=await compareBudget(repo,'admin',{budgetId:'b',transactionIds:['t'],cashEntryIds:['t']})
 assert.equal(result.selectedTotal,'500')
 assert.equal(result.cash?.receiptsTotal,'900719925474099199999')
 await assert.rejects(compareBudget(repo,'other',{budgetId:'b',transactionIds:[],cashEntryIds:['t']}),/unauthorized/i)
 sql.exec("INSERT INTO cash_entry_voids VALUES('t')")
 assert.equal((await repo.list('admin')).cashEntries?.length,0)
 await assert.rejects(compareBudget(repo,'admin',{budgetId:'b',transactionIds:[],cashEntryIds:['t']}))
 assert.equal(result.cash?.selected[0].id,'t')
})
test('void is immutable, admin-only, idempotent and rejects conflicting retries',async()=>{
 const {sql,repo}=setup();await assert.rejects(voidBudget(repo,'other',{budgetId:'b',reason:'error',requestKey:key}),/unauthorized/i)
 const request={budgetId:'b',reason:'Incorrect amount',requestKey:key};const saved=await voidBudget(repo,'admin',request);assert.deepEqual(await voidBudget(repo,'admin',request),saved)
 await assert.rejects(voidBudget(repo,'admin',{...request,reason:'Different'}));await assert.rejects(voidBudget(repo,'admin',{...request,requestKey:'de400e27-89dc-4e12-a1c4-03fafb3ffb63'}))
 assert.throws(()=>sql.exec("UPDATE budget_voids SET reason='changed'"),/immutable/);assert.throws(()=>sql.exec('DELETE FROM budget_voids'),/immutable/)
 const row=(await repo.list('admin')).budgets[0];assert.equal(row.voidReason,'Incorrect amount');assert.equal(row.voidedBy,'admin')
})
test('comparison reads current status and rejects void lines even for stale browser state',async()=>{
 const {repo}=setup();const result=await compareBudget(repo,'admin',{budgetId:'b',transactionIds:['t']});assert.equal(result.difference,'-500')
 await voidBudget(repo,'admin',{budgetId:'b',reason:'error',requestKey:key});await assert.rejects(compareBudget(repo,'admin',{budgetId:'b',transactionIds:['t']}),/void|unavailable/i);await assert.rejects(compareBudget(repo,'other',{budgetId:'b',transactionIds:[]}),/unauthorized/i)
})
test('budget comparison retains database snapshot time',async()=>{const {repo}=setup();const data=await repo.list('admin');assert.match(data.snapshotAt,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);const result=await compareBudget(repo,'admin',{budgetId:'b',transactionIds:['t']});assert.match(result.snapshotAt,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)})
