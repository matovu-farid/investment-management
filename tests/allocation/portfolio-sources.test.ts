import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { capturePortfolioSources } from '../../src/server/allocation/portfolio-sources.ts'

const db = {prepare:()=>({first:async()=>({today:'2026-11-14'})})} as unknown as D1Database
const account={accountId:'c',code:'100',name:'Bank',currency:'UGX',debits:'120',credits:'20',netDebit:'100',netCredit:'0'}
const summary={asOf:'2026-11-01',eligible:2,included:1,omitted:{unconfigured:1,pendingRepayments:0,unavailable:0},totals:[{currency:'UGX',principalMinor:'200',interestMinor:'5'}]}
const dependencies={trial:async()=>({asOf:'2026-11-01',accounts:[account],totals:[]}),lending:async()=>summary}
const input={asOf:'2026-11-01',currency:'UGX',cashAccountIds:['c'],includeLending:true}

test('captures selected cash and lending with explicit omission and interest evidence',async()=>{
 const result=await capturePortfolioSources(db,'admin',input,dependencies)
 assert.equal(result.cash[0].netDebit,'100')
 assert.equal(result.lending?.totals[0].principalMinor,'200')
 assert.equal(result.lending?.totals[0].interestMinor,'5')
 assert.equal(result.lending?.omitted.unconfigured,1)
})
test('rejects duplicate, unavailable, wrong-currency or credit-balance accounts',async()=>{
 await assert.rejects(capturePortfolioSources(db,'admin',{...input,cashAccountIds:['c','c']},dependencies),/duplicate/i)
 await assert.rejects(capturePortfolioSources(db,'admin',{...input,cashAccountIds:['missing']},dependencies),/account/i)
 await assert.rejects(capturePortfolioSources(db,'admin',{...input,currency:'USD'},dependencies),/currency/i)
 await assert.rejects(capturePortfolioSources(db,'admin',input,{...dependencies,trial:async()=>({asOf:input.asOf,accounts:[{...account,netDebit:'0',netCredit:'1'}],totals:[]})}),/credit/i)
})
test('refuses stale cash and lending during capture',async()=>{
 let count=0
 const raced={...dependencies,trial:async()=>({asOf:input.asOf,accounts:[++count===1?account:{...account,netDebit:'101'}],totals:[]})}
 await assert.rejects(capturePortfolioSources(db,'admin',input,raced),/changed/i)
 count=0
 const changed={...dependencies,lending:async()=>++count===1?summary:{...summary,included:2}}
 await assert.rejects(capturePortfolioSources(db,'admin',input,changed),/changed/i)
})
test('rejects future dates and missing authorization before reading sources',async()=>{
 await assert.rejects(capturePortfolioSources(db,null,input,dependencies),/unauthorized/i)
 await assert.rejects(capturePortfolioSources(db,'admin',{...input,asOf:'2026-11-15'},dependencies),/future/i)
})

test('real ledger capture uses posted entries and enforces administrator access',async()=>{
 const {DatabaseSync}=await import('node:sqlite')
 const sql=new DatabaseSync(':memory:')
 sql.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin'),('member','member'); CREATE TABLE ledger_accounts(id TEXT,code TEXT,name TEXT,currency TEXT); INSERT INTO ledger_accounts VALUES('c','100','Bank','UGX'); CREATE TABLE journal_entries(id TEXT,status TEXT,effective_date TEXT); INSERT INTO journal_entries VALUES('posted','posted','2026-10-01'),('draft','draft','2026-10-01'),('future','posted','2026-12-01'); CREATE TABLE journal_lines(entry_id TEXT,account_id TEXT,side TEXT,amount_minor INTEGER); INSERT INTO journal_lines VALUES('posted','c','debit',120),('posted','c','credit',20),('draft','c','debit',900),('future','c','debit',800)")
 type Statement={query:string;values:unknown[];bind:(...values:unknown[])=>Statement;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 function statement(query:string):Statement{return {query,values:[],bind(...values){this.values=values;return this},async first(){return sql.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:sql.prepare(this.query).all(...this.values as never[])}}}}
 const realDb={prepare:statement,async batch(items:Statement[]){return Promise.all(items.map(s=>s.all()))}} as unknown as D1Database
 const selected={...input,includeLending:false}
 const result=await capturePortfolioSources(realDb,'admin',selected)
 assert.equal(result.cash[0].debits,'120');assert.equal(result.cash[0].credits,'20');assert.equal(result.cash[0].netDebit,'100')
 await assert.rejects(capturePortfolioSources(realDb,'member',selected),/unauthorized/i)
 sql.close()
})

test('records the UTC window for reading selected cash and lending sources',async()=>{
 const result=await capturePortfolioSources(db,'admin',input,dependencies)
 assert.match(result.capturedFrom,/^\d{4}-\d{2}-\d{2}T/)
 assert.match(result.capturedTo,/^\d{4}-\d{2}-\d{2}T/)
 assert.ok(result.capturedFrom<=result.capturedTo)
})
