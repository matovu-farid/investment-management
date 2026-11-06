import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { lendingRepository } from '../../src/server/lending/repository.ts'
import { createLoan, createBooking, createRepayment, createFulfilment } from '../../src/server/lending/service.ts'

function fixture(mutate: (db: DatabaseSync) => void) {
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0005_lending_idempotency.sql','0008_booking_fulfilment.sql','0009_repayment_idempotency.sql','0010_lending_chronology.sql']) db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT); INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m',100,'UGX','2026-01-01','Terms','u'); INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES('b','m',100,'UGX','2026-01-01','u');`)
 let injected=false
 const adapter={prepare(q:string){const stmt=db.prepare(q);let v:unknown[]=[];return {bind(...args:unknown[]){v=args;return this},async first(){return stmt.get(...v as never[])??null},async run(){if(!injected&&/^INSERT INTO (loans|credit_bookings|loan_repayments|credit_booking_fulfilments)\b/i.test(q)){injected=true;mutate(db)}return stmt.run(...v as never[])}}}} as unknown as D1Database
 return {db,repo:lendingRepository(adapter)}
}
const key='b75610af-140f-46d8-ac6c-a4be05c42b01'
const operations=[
 {name:'loan',table:'loans',call:(r:ReturnType<typeof lendingRepository>)=>createLoan(r,'u',{idempotencyKey:key,memberId:'m',principalMinor:10,currency:'UGX',disbursementDate:'2026-01-02',terms:'Terms'})},
 {name:'booking',table:'credit_bookings',call:(r:ReturnType<typeof lendingRepository>)=>createBooking(r,'u',{idempotencyKey:key,memberId:'m',requestedMinor:10,currency:'UGX',requestedDate:'2026-01-02'})},
 {name:'repayment',table:'loan_repayments',call:(r:ReturnType<typeof lendingRepository>)=>createRepayment(r,'u',{idempotencyKey:key,loanId:'l',paymentDate:'2026-01-02',amountMinor:10})},
 {name:'fulfilment',table:'credit_booking_fulfilments',call:(r:ReturnType<typeof lendingRepository>)=>createFulfilment(r,'u',{idempotencyKey:key,bookingId:'b',fulfilmentDate:'2026-01-02',amountMinor:10})},
]
for(const operation of operations)test(`${operation.name} rejects administrator demotion immediately before insert`,async()=>{
 const {db,repo}=fixture(db=>db.exec("DELETE FROM app_user_roles WHERE user_id='u'"))
 await assert.rejects(operation.call(repo))
 assert.equal((db.prepare(`SELECT count(*) n FROM ${operation.table} WHERE idempotency_key=?`).get(key) as {n:number}).n,0)
 db.close()
})
for(const operation of operations.slice(0,2))test(`${operation.name} rejects member deactivation immediately before insert`,async()=>{
 const {db,repo}=fixture(db=>db.exec("UPDATE members SET status='inactive' WHERE id='m'"))
 await assert.rejects(operation.call(repo))
 assert.equal((db.prepare(`SELECT count(*) n FROM ${operation.table} WHERE idempotency_key=?`).get(key) as {n:number}).n,0)
 db.close()
})
test('repayment rejects source loan voided immediately before insert',async()=>{
 const {db,repo}=fixture(db=>db.exec("INSERT INTO loan_source_voids(source_kind,source_id) VALUES('loan','l')"))
 await assert.rejects(operations[2].call(repo))
 assert.equal((db.prepare('SELECT count(*) n FROM loan_repayments').get() as {n:number}).n,0)
 db.close()
})
