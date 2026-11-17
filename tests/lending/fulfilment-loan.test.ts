import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {lendingRepository} from '../../src/server/lending/repository.ts'
import {createFulfilment} from '../../src/server/lending/service.ts'
import {createReportRepository} from '../../src/server/reports/repository.ts'
import {reportCsv} from '../../src/lib/report-export/export.ts'
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a');INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','a'),('other','2','Other','a');INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES('b','m',100,'UGX','2026-01-01','a');INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m',80,'UGX','2026-01-02','terms','a'),('wrong','other',80,'UGX','2026-01-02','terms','a'),('usd','m',80,'USD','2026-01-02','terms','a');`)
 type Stmt={q:string;a:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 const stmt=(q:string,a:unknown[]=[]):Stmt=>({q,a,bind(...v){return stmt(q,v)},async first(){return sql.prepare(q).get(...a as never[])??null},async all(){return {results:sql.prepare(q).all(...a as never[])}},async run(){return sql.prepare(q).run(...a as never[])}})
 const db={prepare:(q:string)=>stmt(q),async batch(stmts:Stmt[]){return Promise.all(stmts.map(s=>s.all()))}} as unknown as D1Database
 return {sql,db,repo:lendingRepository(db)}
}
const input={idempotencyKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bookingId:'b',loanId:'l',amountMinor:50,fulfilmentDate:'2026-01-03'}
test('explicit loan link is retained, retry-safe and protected against incompatible records',async()=>{
 const {sql,repo}=fixture();const first=await createFulfilment(repo,'a',input)
 assert.equal(first.loanId,'l');assert.equal((await createFulfilment(repo,'a',input)).id,first.id)
 await assert.rejects(createFulfilment(repo,'a',{...input,loanId:'wrong'}),/different/i)
 await assert.rejects(createFulfilment(repo,'a',{...input,idempotencyKey:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',loanId:'wrong'}),/loan/i)
 await assert.rejects(createFulfilment(repo,'a',{...input,idempotencyKey:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',loanId:'usd'}),/loan/i)
 await assert.rejects(createFulfilment(repo,'a',{...input,idempotencyKey:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',amountMinor:31}),/loan/i)
 assert.equal((await repo.list('a')).fulfilments[0].loanId,'l')
 sql.close()
})
test('a voided fulfilment releases linked principal while preserving history',async()=>{
 const {sql,repo}=fixture();const first=await createFulfilment(repo,'a',input)
 assert.throws(()=>sql.exec("INSERT INTO loan_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','loan','l','error','void','a')"),/dependent/i)
 sql.prepare("INSERT INTO booking_fulfilment_voids(id,fulfilment_id,reason,request_key,created_by) VALUES('vf',?,'correction','void-fulfilment','a')").run(first.id)
 const next=await createFulfilment(repo,'a',{...input,idempotencyKey:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',amountMinor:80})
 assert.equal(next.loanId,'l');const list=await repo.list('a');assert.equal(list.fulfilments.length,2);assert.equal(list.bookings[0].fulfilledMinor,80);assert.ok(list.fulfilments.find(f=>f.id===first.id)?.voidedAt)
 sql.close()
})
test('multiple bookings cannot allocate more than one loan principal and a link posts no journal',async()=>{
 const {sql,repo}=fixture()
 sql.exec("INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES('b2','m',100,'UGX','2026-01-01','a')")
 await createFulfilment(repo,'a',input)
 await assert.rejects(createFulfilment(repo,'a',{...input,bookingId:'b2',amountMinor:31,idempotencyKey:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),/loan/i)
 await createFulfilment(repo,'a',{...input,bookingId:'b2',amountMinor:30,idempotencyKey:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'})
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM journal_entries').get()?.n,0)
 assert.equal(sql.prepare("SELECT SUM(amount_minor) AS n FROM credit_booking_fulfilments WHERE loan_id='l'").get()?.n,80)
 sql.close()
})
test('active loan links protect booking and loan identity and financial fields from later changes',async()=>{
 const {sql,repo}=fixture();const f=await createFulfilment(repo,'a',input)
 for(const command of ["UPDATE loans SET member_id='other' WHERE id='l'","UPDATE loans SET currency='USD' WHERE id='l'","UPDATE loans SET principal_minor=40 WHERE id='l'","UPDATE loans SET disbursement_date='2026-01-04' WHERE id='l'","UPDATE credit_bookings SET member_id='other' WHERE id='b'","UPDATE credit_bookings SET currency='USD' WHERE id='b'"])assert.throws(()=>sql.exec(command),/linked|fulfilment/i)
 sql.exec("UPDATE loans SET terms='updated note' WHERE id='l'")
 sql.prepare("INSERT INTO booking_fulfilment_voids(id,fulfilment_id,reason,request_key,created_by) VALUES('vf2',?,'correction','void-2','a')").run(f.id)
 sql.exec("UPDATE loans SET principal_minor=40 WHERE id='l'")
 sql.close()
})
test('reports preserve the linked fulfilment audit trail while excluding corrections from the booking balance',async()=>{
 const {sql,db,repo}=fixture();const reports=createReportRepository(db)
 const first=await createFulfilment(repo,'a',input)
 let report=await reports.forPeriod('2026-01-01','2026-01-31','a')
 assert.equal(report.bookingSnapshot[0].fulfilledMinor,'50');assert.equal(report.bookingSnapshot[0].remainingMinor,'50')
 assert.equal(report.fulfilments[0].loanId,'l');assert.equal(report.fulfilments[0].voidedAt,null)
 sql.prepare("INSERT INTO booking_fulfilment_voids(id,fulfilment_id,reason,request_key,created_by) VALUES('vf',?,'correction','void-fulfilment','a')").run(first.id)
 report=await reports.forPeriod('2026-01-01','2026-01-31','a')
 assert.equal(report.bookingSnapshot[0].fulfilledMinor,'0');assert.equal(report.bookingSnapshot[0].remainingMinor,'100')
 await createFulfilment(repo,'a',{...input,idempotencyKey:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',amountMinor:80})
 report=await reports.forPeriod('2026-01-01','2026-01-31','a')
 assert.equal(report.bookingSnapshot[0].fulfilledMinor,'80');assert.equal(report.bookingSnapshot[0].remainingMinor,'20')
 assert.equal(report.fulfilments.length,2);assert.ok(report.fulfilments.every(f=>f.loanId==='l'))
 assert.equal(report.fulfilments.filter(f=>f.voidedAt).length,1);assert.equal(report.fulfilments.find(f=>f.voidedAt)?.voidReason,'correction')
 const csv=reportCsv(report);assert.match(csv,/Associated loan ID/);assert.match(csv,/correction/)
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM journal_entries').get()?.n,0)
 sql.close()
})
