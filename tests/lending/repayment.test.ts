import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { lendingRepository } from '../../src/server/lending/repository.ts'
import { createRepayment, createFulfilment } from '../../src/server/lending/service.ts'

test('repayments are admin-only, linked to one loan, validated and retry-safe', async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON')
  for (const file of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0005_lending_idempotency.sql','0008_booking_fulfilment.sql','0009_repayment_idempotency.sql','0010_lending_chronology.sql']) db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)")
  db.exec("CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('u','Admin','admin@example.org',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES ('u','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l1','m',100,'UGX','2026-01-02','terms','u'),('l2','m',200,'UGX','2026-01-03','terms','u'); INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES('b','m',100,'UGX','2026-01-02','u');`)
  const adapter = { prepare(query: string) { const stmt=db.prepare(query); let values: unknown[]=[]; return { bind(...v:unknown[]) { values=v; return this }, async run() { return stmt.run(...values as never[]) }, async first() { return stmt.get(...values as never[]) ?? null } } } } as unknown as D1Database
  const repo=lendingRepository(adapter)
  const input={idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b01',loanId:'l1',paymentDate:'2026-01-03',amountMinor:50,reference:'receipt',notes:'cash'}
  await assert.rejects(createRepayment(repo,null,input),/unauthorized/i)
  for (const invalid of [{...input,amountMinor:0},{...input,paymentDate:'2026-02-30'},{...input,paymentDate:'2026-01-01'},{...input,loanId:'missing'}]) await assert.rejects(createRepayment(repo,'u',invalid))
  assert.throws(() => db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('bad','l1','2026-01-01',1,'u')"), /repayment date/i)
  assert.throws(() => db.exec("INSERT INTO credit_booking_fulfilments(id,booking_id,fulfilment_date,amount_minor,created_by) VALUES('bad','b','2026-01-01',1,'u')"), /fulfilment date/i)
  const first=await createRepayment(repo,'u',input)
  assert.equal((await createRepayment(repo,'u',input)).id,first.id)
  await assert.rejects(createRepayment(repo,'u',{...input,loanId:'l2'}),/different repayment/)
  await createRepayment(repo,'u',{...input,idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b02',loanId:'l2'})
  assert.equal((db.prepare('SELECT count(*) AS n FROM loan_repayments').get() as {n:number}).n,2)
  assert.equal((db.prepare('SELECT count(*) AS n FROM journal_entries').get() as {n:number}).n,0)
  db.exec(`INSERT INTO loan_source_voids VALUES ('repayment','${first.id}','error','2026-11-05')`)
  await assert.rejects(createRepayment(repo,'u',input),/void/i)
  db.exec("INSERT INTO loan_source_voids VALUES ('loan','l2','error','2026-11-05')")
  await assert.rejects(createRepayment(repo,'u',{...input,idempotencyKey:crypto.randomUUID(),loanId:'l2'}))
  assert.throws(()=>db.exec("UPDATE loans SET disbursement_date='2026-02-01' WHERE id='l1'"),/repayment/i)
  await assert.rejects(createFulfilment(repo,'u',{idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b03',bookingId:'b',amountMinor:1,fulfilmentDate:'2026-01-01'}),/date/i)
  await createFulfilment(repo,'u',{idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b03',bookingId:'b',amountMinor:1,fulfilmentDate:'2026-01-03'})
  assert.throws(()=>db.exec("UPDATE credit_bookings SET requested_date='2026-02-01' WHERE id='b'"),/fulfilment/i)
  db.close()
})
