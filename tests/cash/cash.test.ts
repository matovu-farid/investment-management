import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

function setup() {
  const sql = new DatabaseSync(':memory:')
  for (const file of readdirSync('migrations').filter(x => x.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${file}`, 'utf8'))
  sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1),('m','Member','m@example.test',1,1),('b','Admin 2','b@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a'),('b','admin','a')`)
  const stmt = (query:string,args:unknown[] = []) => ({ bind(...p:unknown[]){ return stmt(query,p) }, async first(){return sql.prepare(query).get(...args as never[]) ?? null}, async all(){return {results:sql.prepare(query).all(...args as never[])}}, async run(){return sql.prepare(query).run(...args as never[])} })
  return {sql,db:{prepare:(query:string)=>stmt(query)} as unknown as D1Database}
}
const request = {entryDate:'2020-01-15',direction:'receipt',amountMinor:'123456789012345678901234567890',currency:'UGX',counterparty:'Vendor',reference:'REF-1',description:'Subscription',requestKey:'fa5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}

test('administrators record exact cash facts, with idempotency and audit-safe voids', async()=>{
 const {db,sql}=setup(); const s=await import('../../src/server/cash/service.ts')
 await assert.rejects(s.recordCashEntry(db,'m',request),/unauthorized/i)
 const a=await s.recordCashEntry(db,'a',request)
 assert.equal((await s.recordCashEntry(db,'a',request)).id,a.id)
 await assert.rejects(s.recordCashEntry(db,'a',{...request,description:'Changed'}),/used/i)
 await assert.rejects(s.recordCashEntry(db,'b',request),/used/i)
 assert.equal((await s.listCashEntries(db,'a',{from:'2020-01-01',to:'2020-01-31'})).entries[0].amountMinor,request.amountMinor)
 await assert.rejects(s.listCashEntries(db,'m',{from:'2020-01-01',to:'2020-01-31'}),/unauthorized/i)
 const v={entryId:a.id,reason:'Incorrect entry',requestKey:'1a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}
 await assert.rejects(s.voidCashEntry(db,'m',v),/unauthorized/i)
 const saved=await s.voidCashEntry(db,'a',v); assert.equal((await s.voidCashEntry(db,'a',v)).id,saved.id)
 await assert.rejects(s.voidCashEntry(db,'a',{...v,reason:'Different'}),/used/i)
 await assert.rejects(s.voidCashEntry(db,'b',v),/used/i)
 assert.equal((await s.recordCashEntry(db,'a',request)).active,false)
 const listed=(await s.listCashEntries(db,'a',{from:'2020-01-01',to:'2020-01-31'})).entries[0]; assert.equal(listed.voidReason,v.reason);assert.equal(listed.voidedBy,'a')
 assert.throws(()=>sql.exec('DELETE FROM cash_entries'),/immutable/i)
 assert.throws(()=>sql.exec("UPDATE cash_entry_voids SET reason='bad'"),/immutable/i)
})

test('period boundaries, direction and inputs are validated; unrelated dates are excluded', async()=>{
 const {db}=setup(); const s=await import('../../src/server/cash/service.ts')
 await s.recordCashEntry(db,'a',request)
 const second={...request,entryDate:'2020-02-01',direction:'payment',amountMinor:'1',requestKey:'2a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}
 await s.recordCashEntry(db,'a',second)
 assert.equal((await s.listCashEntries(db,'a',{from:'2020-01-15',to:'2020-01-15'})).entries.length,1)
 assert.equal((await s.listCashEntries(db,'a',{from:'2020-01-16',to:'2020-01-31'})).entries.length,0)
 await assert.rejects(s.listCashEntries(db,'a',{from:'2020-02-01',to:'2020-01-01'}))
 for (const change of [{entryDate:'2020-02-30'},{direction:'other'},{amountMinor:'0'},{amountMinor:'01'},{amountMinor:'-1'},{amountMinor:'1.5'},{amountMinor:'9'.repeat(31)},{currency:'ugx'},{description:''}]) await assert.rejects(s.recordCashEntry(db,'a',{...request,...change,requestKey:'3a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}))
})

test('database guards enforce authorization, dates, and one void per entry',async()=>{
 const {db,sql}=setup();const s=await import('../../src/server/cash/service.ts');const a=await s.recordCashEntry(db,'a',request)
 assert.throws(()=>sql.exec("INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) VALUES('x','2020-01-01','receipt','1','UGX','','','x','key','m')"),/unauthorized/i)
 assert.throws(()=>sql.exec("INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) VALUES('x','2020-02-30','receipt','1','UGX','','','x','key','a')"),/date/i)
 await s.recordCashEntry(db,'a',{...request,entryDate:'9999-12-31',requestKey:'6a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'})
 await s.voidCashEntry(db,'a',{entryId:a.id,reason:'Incorrect',requestKey:'4a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'})
 await assert.rejects(s.voidCashEntry(db,'a',{entryId:a.id,reason:'Again',requestKey:'5a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}))
})
