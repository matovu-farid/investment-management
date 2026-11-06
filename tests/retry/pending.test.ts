import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createPendingStore } from '../../src/lib/pending-requests/store.ts'
import { lendingRepository } from '../../src/server/lending/repository.ts'
import { createRepayment } from '../../src/server/lending/service.ts'

function storage() {
 const values = new Map<string,string>()
 return { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value) }, removeItem: (key:string) => { values.delete(key) } }
}
test('pending request persists exact payload and is isolated by user and operation', () => {
 const s=storage()
 const original={idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b01',loanId:'loan',amountMinor:100,paymentDate:'2026-02-01',reference:'',notes:''}
 const store=createPendingStore<typeof original>(s, 'alice', 'repayment')
 store.begin(original)
 assert.deepEqual(createPendingStore(s,'alice','repayment').read(),original)
 assert.equal(createPendingStore(s,'bob','repayment').read(),null)
 assert.equal(createPendingStore(s,'alice','loan').read(),null)
 assert.throws(()=>store.begin({...original,amountMinor:200}),/pending/i)
 assert.deepEqual(store.read(),original)
 assert.throws(()=>store.confirm('wrong'),/changed/i)
 store.confirm(original.idempotencyKey)
 assert.equal(store.read(),null)
})
test('a committed repayment with a lost response retries after reload without duplication', async () => {
 const db=new DatabaseSync(':memory:'); db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)"); db.exec('PRAGMA foreign_keys=ON')
 for(const file of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0009_repayment_idempotency.sql','0010_lending_chronology.sql']) db.exec(readFileSync(`migrations/${file}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES ('u','Admin','a@example.org',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES ('u','admin','u'); INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('l','m',1000,'UGX','2026-01-01','terms','u');`)
 const adapter={prepare(query:string){const stmt=db.prepare(query); let args:unknown[]=[]; return {bind(...v:unknown[]){args=v;return this},async run(){return stmt.run(...args as never[])},async first(){return stmt.get(...args as never[])??null}}}} as unknown as D1Database
 const repo=lendingRepository(adapter), s=storage(), payload={idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b02',loanId:'l',amountMinor:100,paymentDate:'2026-02-01',reference:'test',notes:''}
 createPendingStore(s,'u','repayment').begin(payload)
 await createRepayment(repo,'u',payload) // The server commits, but the response is lost.
 const reloaded=createPendingStore<typeof payload>(s,'u','repayment'), retry=reloaded.read()
 assert.deepEqual(retry,payload)
 await createRepayment(repo,'u',retry)
 reloaded.confirm(payload.idempotencyKey)
 assert.equal((db.prepare('SELECT COUNT(*) n FROM loan_repayments').get() as {n:number}).n,1)
 assert.equal(reloaded.read(),null)
 db.close()
})

test('storage failure prevents starting a request and never drops an existing request', () => {
 const values=storage(), payload={idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b03', amount:123}
 const failed={...values, setItem(){throw new Error('quota')}}
 assert.throws(()=>createPendingStore(failed,'u','loan').begin(payload),/quota/)
 assert.equal(createPendingStore(values,'u','loan').read(),null)
 const pending=createPendingStore<typeof payload>(values,'u','loan'); pending.begin(payload)
 const brokenRemove={...values, removeItem(){throw new Error('blocked')}}
 assert.throws(()=>createPendingStore(brokenRemove,'u','loan').confirm(payload.idempotencyKey),/blocked/)
 assert.deepEqual(pending.read(),payload)
})
test('corrupted pending storage blocks replacement until explicitly discarded', () => {
 const values=storage(), key='rnig.pending.v1.u.loan'
 values.setItem(key,'not-json')
 const pending=createPendingStore(values,'u','loan')
 assert.throws(()=>pending.read(),/unreadable/)
 assert.throws(()=>pending.begin({idempotencyKey:'new'}),/pending/)
 pending.discard()
 assert.equal(pending.read(),null)
})

test('sign-out asks before removing only the current user’s pending requests', async () => {
 const { signOutWithPendingProtection } = await import('../../src/lib/pending-requests/signout.ts')
 const values = new Map<string,string>()
 const s = { get length(){return values.size}, key:(i:number)=>Array.from(values.keys())[i]??null, getItem:(k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>{values.set(k,v)}, removeItem:(k:string)=>{values.delete(k)} }
 createPendingStore(s,'u','repayment').begin({idempotencyKey:'u-key'})
 createPendingStore(s,'other','loan').begin({idempotencyKey:'other-key'})
 createPendingStore(s,'u.extra','loan').begin({idempotencyKey:'prefix-user-key'})
 let calls=0
 assert.deepEqual(await signOutWithPendingProtection(()=>s,'u',()=>false,async()=>{calls++;return {error:null}}),{signedOut:false,cleanupFailed:false})
 assert.equal(calls,0)
 await assert.rejects(signOutWithPendingProtection(()=>s,'u',()=>true,async()=>({error:{message:'failed'}})),/sign out/i)
 assert.ok(createPendingStore(s,'u','repayment').read())
 assert.deepEqual(await signOutWithPendingProtection(()=>s,'u',()=>true,async()=>{calls++;return {error:null}}),{signedOut:true,cleanupFailed:false})
 assert.equal(createPendingStore(s,'u','repayment').read(),null)
 assert.ok(createPendingStore(s,'other','loan').read())
 assert.ok(createPendingStore(s,'u.extra','loan').read())
})

test('storage getter or enumeration failure asks before signing out', async () => {
 const { signOutWithPendingProtection } = await import('../../src/lib/pending-requests/signout.ts')
 for (const storageProvider of [
   () => { throw new Error('blocked getter') },
   () => ({get length():number { throw new Error('blocked enumeration') }, key:()=>null, getItem:()=>null, removeItem:()=>{}}),
 ]) {
  let calls=0, prompts=0
  const cancel=await signOutWithPendingProtection(storageProvider,'u',()=>{prompts++;return false},async()=>{calls++;return {error:null}})
  assert.deepEqual(cancel,{signedOut:false,cleanupFailed:false})
  assert.equal(calls,0); assert.equal(prompts,1)
  const done=await signOutWithPendingProtection(storageProvider,'u',()=>{prompts++;return true},async()=>{calls++;return {error:null}})
  assert.deepEqual(done,{signedOut:true,cleanupFailed:true})
  assert.equal(calls,1); assert.equal(prompts,2)
 }
})

test('cleanup failure after confirmed sign-out reports success and warning', async () => {
 const { signOutWithPendingProtection } = await import('../../src/lib/pending-requests/signout.ts')
 let calls=0
 const s={length:1,key:()=> 'rnig.pending.v1.u.loan',getItem:()=> 'pending',removeItem:()=>{throw new Error('blocked cleanup')}}
 const done=await signOutWithPendingProtection(()=>s,'u',()=>true,async()=>{calls++;return {error:null}})
 assert.deepEqual(done,{signedOut:true,cleanupFailed:true}); assert.equal(calls,1)
})

test('unavailable storage still reports failed authentication without claiming sign-out', async () => {
 const { signOutWithPendingProtection } = await import('../../src/lib/pending-requests/signout.ts')
 let reason: string | undefined
 await assert.rejects(signOutWithPendingProtection(()=>{throw new Error('blocked')},'u',value=>{reason=value;return true},async()=>({error:{message:'network'}})),/could not sign out/i)
 assert.equal(reason,'unavailable')
})
