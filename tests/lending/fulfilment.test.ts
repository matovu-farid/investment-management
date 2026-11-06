import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { lendingRepository } from '../../src/server/lending/repository.ts'
import { createFulfilment } from '../../src/server/lending/service.ts'

test('partial fulfilments are retry-safe and database prevents overfulfilment', async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON')
  for (const file of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0005_lending_idempotency.sql','0008_booking_fulfilment.sql']) db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  db.exec("CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('u','Admin','a@example.org',1,1); INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('u','admin','bootstrap'); INSERT INTO members (id,member_number,full_name,created_by) VALUES ('m','1','Member','u'); INSERT INTO credit_bookings (id,member_id,requested_minor,currency,requested_date,created_by) VALUES ('b','m',100,'UGX','2026-01-01','u');`)
  const adapter = { prepare(query: string) { const stmt=db.prepare(query); let values: unknown[]=[]; return { bind(...v:unknown[]) { values=v; return this }, async run() { return stmt.run(...values as never[]) }, async first() { return stmt.get(...values as never[]) ?? null } } } } as unknown as D1Database
  const repo=lendingRepository(adapter)
  const input = { idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b01', bookingId:'b', amountMinor:60, fulfilmentDate:'2026-01-02' }
  const first=await createFulfilment(repo,'u',input)
  assert.equal((await createFulfilment(repo,'u',input)).id,first.id)
  await assert.rejects(createFulfilment(repo,'u',{...input,amountMinor:50}), /different fulfilment/)
  await assert.rejects(createFulfilment(repo,'u',{...input,idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b02',amountMinor:41}), /exceeds/)
  await createFulfilment(repo,'u',{...input,idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b03',amountMinor:40})
  assert.equal((db.prepare('SELECT sum(amount_minor) total FROM credit_booking_fulfilments').get() as {total:number}).total,100)
  assert.throws(() => db.exec("UPDATE credit_booking_fulfilments SET amount_minor=1"), /immutable/)
  assert.throws(() => db.exec("UPDATE credit_bookings SET requested_minor=99 WHERE id='b'"), /below/)
  assert.throws(() => db.exec("INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by) VALUES('extra','b',1,'2026-01-02','u')"), /exceeds/)
  db.close()
})

test('voided fulfilment stays in history, is excluded from totals and cannot be retried as active',async()=>{
 const db=new DatabaseSync(':memory:');for(const f of ['0002_domain.sql','0005_lending_idempotency.sql','0008_booking_fulfilment.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin'); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_import_refs(source_ref TEXT,booking_id TEXT); CREATE TABLE booking_fulfilment_import_refs(source_ref TEXT,fulfilment_id TEXT,batch_id TEXT); INSERT INTO booking_fulfilment_import_refs VALUES('fulfilment-source-1','f','batch'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','admin'); INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,notes,created_by) VALUES('b','m',100,'UGX','2026-01-01','Source note','admin'); INSERT INTO booking_import_refs VALUES('source-1','b'); INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by,idempotency_key) VALUES('f','b',30,'2026-02-01','admin','key'); INSERT INTO booking_fulfilment_voids VALUES('f','wrong amount','2026-11-05')")
 let batchUsed=false;const adapter={prepare(q:string){const s=db.prepare(q);let v:unknown[]=[];return {bind(...args:unknown[]){v=args;return this},async all(){return {results:s.all(...v as never[])}},async first(){return s.get(...v as never[])??null},async run(){return s.run(...v as never[])}}},async batch(stmts:{all:()=>Promise<unknown>}[]){batchUsed=true;return Promise.all(stmts.map(s=>s.all()))}} as unknown as D1Database
 const repo=lendingRepository(adapter),list=await repo.list();assert.equal(batchUsed,true);assert.equal(list.bookings[0].fulfilledMinor,0);assert.equal(list.bookings[0].sourceRef,'source-1');assert.equal(list.bookings[0].notes,'Source note');assert.equal(list.fulfilments[0].voidReason,'wrong amount');assert.equal(list.fulfilments[0].bookingSourceRef,'source-1');assert.equal(list.fulfilments[0].sourceRef,'fulfilment-source-1');await assert.rejects(repo.createFulfilment({id:'new',bookingId:'b',amountMinor:30,fulfilmentDate:'2026-02-01',createdBy:'admin'},'key'),/void/i);db.close()
})
