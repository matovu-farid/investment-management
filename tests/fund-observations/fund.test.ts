import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

function setup() {
  const sql = new DatabaseSync(':memory:')
  for (const file of readdirSync('migrations').filter(x => x.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${file}`, 'utf8'))
  sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1),('m','Member','m@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a')`)
  const stmt = (query:string,args:unknown[] = []) => ({ bind(...p:unknown[]){ return stmt(query,p) }, async first(){return sql.prepare(query).get(...args as never[]) ?? null}, async all(){return {results:sql.prepare(query).all(...args as never[])}}, async run(){return sql.prepare(query).run(...args as never[])} })
  return {sql,db:{prepare:(query:string)=>stmt(query)} as unknown as D1Database}
}
const request = {observedDate:'2020-01-01',amountMinor:'123456789012345678901234567890',currency:'UGX',basis:'Reported available funds',source:'Test fund statement',requestKey:'fa5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}

test('only an administrator records exact sourced observations, with safe retries and immutable void history', async()=>{
  const {db,sql}=setup(); const s=await import('../../src/server/fund-observations/service.ts')
  await assert.rejects(s.recordFundObservation(db,'m',request),/unauthorized/i)
  const a=await s.recordFundObservation(db,'a',request)
  assert.equal((await s.recordFundObservation(db,'a',request)).id,a.id)
  await assert.rejects(s.recordFundObservation(db,'a',{...request,source:'Different'}),/used/i)
  assert.equal((await s.listFundObservations(db,'a')).observations[0].amountMinor,request.amountMinor)
  await assert.rejects(s.listFundObservations(db,'m'),/unauthorized/i)
  const v={observationId:a.id,reason:'Incorrect source',requestKey:'1a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}
  const saved=await s.voidFundObservation(db,'a',v); assert.equal((await s.voidFundObservation(db,'a',v)).id,saved.id)
  await assert.rejects(s.voidFundObservation(db,'a',{...v,reason:'Different'}),/used/i)
  assert.equal((await s.recordFundObservation(db,'a',request)).active,false)
  assert.equal((await s.listFundObservations(db,'a')).observations[0].voidReason,v.reason)
  assert.throws(()=>sql.exec('DELETE FROM fund_availability_observations'),/immutable/i)
  assert.throws(()=>sql.exec("UPDATE fund_availability_voids SET reason='bad'"),/immutable/i)
})

test('validates dates, nonnegative canonical minor units, currency, source and basis', async()=>{
  const {db}=setup(); const s=await import('../../src/server/fund-observations/service.ts')
  for (const change of [{observedDate:'2020-02-30'},{observedDate:'9999-12-31'},{amountMinor:'01'},{amountMinor:'-1'},{amountMinor:'1.5'},{amountMinor:'9'.repeat(31)},{currency:'ugx'},{basis:''},{source:''}]) await assert.rejects(s.recordFundObservation(db,'a',{...request,...change}))
  const zero=await s.recordFundObservation(db,'a',{...request,amountMinor:'0',requestKey:'2a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}); assert.equal(zero.active,true)
})

test('database guards reject unauthorized and future-dated direct inserts',()=>{
  const {sql}=setup()
  assert.throws(()=>sql.exec("INSERT INTO fund_availability_observations(id,observed_date,amount_minor,currency,basis,source,request_key,created_by) VALUES('x','2020-01-01','1','UGX','basis','source','key','m')"),/unauthorized/i)
  assert.throws(()=>sql.exec("INSERT INTO fund_availability_observations(id,observed_date,amount_minor,currency,basis,source,request_key,created_by) VALUES('x','9999-12-31','1','UGX','basis','source','key','a')"),/date/i)
})
