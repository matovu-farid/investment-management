import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {test} from 'node:test'
import {createPendingStore} from '../../src/lib/pending-requests/store.ts'
import {createInvestmentRepository} from '../../src/server/investments/repository.ts'
import {createPolicyRepository} from '../../src/server/policy/repository.ts'
import type {Investment,Valuation,InvestmentTransaction} from '../../src/server/investments/service.ts'
import type {PolicyTarget} from '../../src/server/policy/service.ts'

test('investment, valuation, transaction and policy retries after reload do not duplicate',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 db.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin')")
 db.exec('CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)')
 for(const file of ['0002_domain.sql','0004_investment_idempotency.sql','0007_investment_transaction_idempotency.sql','0013_policy_idempotency.sql'])db.exec(readFileSync(`migrations/${file}`,'utf8'))
 const adapter={prepare(sql:string){return {bind(...values:unknown[]){const stmt=db.prepare(sql);return {async run(){return stmt.run(...values as never[])},async first(){return stmt.get(...values as never[])??null}}}}}}
 const investment=createInvestmentRepository(adapter as unknown as D1Database),policy=createPolicyRepository(adapter as unknown as D1Database)
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}}
 const base:Investment={id:'i',name:'Test bond',assetClass:'Bonds',currency:'UGX',status:'active',createdBy:'admin'}
 const valuation:Valuation={id:'v',investmentId:'i',valuationDate:'2026-01-01',amountMinor:100,currency:'UGX',basis:'Market',source:null,createdBy:'admin'}
 const transaction:InvestmentTransaction={id:'t',investmentId:'i',transactionDate:'2026-01-02',transactionType:'Interest',amountMinor:20,reference:null,notes:null,createdBy:'admin'}
 const target:PolicyTarget={id:'p',assetClass:'Bonds',effectiveDate:'2026-01-01',minBasisPoints:1000,maxBasisPoints:3000,targetBasisPoints:null,source:'IPS',notes:null,createdBy:'admin'}
 async function retry<T extends {id:string}>(operation:string,key:string,value:T,write:(v:T,k:string)=>Promise<T>){
  const original={idempotencyKey:key,value};createPendingStore<typeof original>(storage,'admin',operation).begin(original)
  const first=await write(value,key) // response lost after database commit
  const reloaded=createPendingStore<typeof original>(storage,'admin',operation);const saved=reloaded.read();assert.ok(saved)
  const again=await write({...saved.value,id:`${value.id}-retry`},saved.idempotencyKey);assert.equal(again.id,first.id)
  reloaded.confirm(saved.idempotencyKey);assert.equal(reloaded.read(),null)
 }
 await retry('investment-create','k1',base,(v,k)=>investment.create(v,k))
 await retry('investment-valuation','k2',valuation,(v,k)=>investment.addValuation(v,k))
 await retry('investment-transaction','k3',transaction,(v,k)=>investment.addTransaction(v,k))
 await retry('policy-range','k4',target,(v,k)=>policy.create(v,k))
 for(const table of ['investments','investment_valuations','investment_transactions','policy_targets'])assert.equal((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n,1)
 db.close()
})
