import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {saveDetails,listDetails} from '../../src/server/credit-request-details/service.ts'

function setup(){
 const sql=new DatabaseSync(':memory:')
 sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE app_user_roles(user_id TEXT,role TEXT); CREATE TABLE credit_bookings(id TEXT PRIMARY KEY); INSERT INTO app_user_roles VALUES('admin','admin'),('member','member'); INSERT INTO credit_bookings VALUES('booking');")
 sql.exec(readFileSync('migrations/0099_credit_request_details.sql','utf8'))
 const stmt=(query:string,args:unknown[]=[])=>({bind(...values:unknown[]){return stmt(query,values)},async first(){return sql.prepare(query).get(...args as never[])??null},async all(){return {results:sql.prepare(query).all(...args as never[])}},async run(){return sql.prepare(query).run(...args as never[])}})
 return {sql,db:{prepare:(query:string)=>stmt(query)} as unknown as D1Database}
}
const key1='11111111-1111-4111-8111-111111111111',key2='22222222-2222-4222-8222-222222222222'
const request={bookingId:'booking',expectedRevision:null,requestKey:key1,purpose:'Business',repaymentPromise:'Monthly',interestOption:'2% per 60 days',duration:'12 months',receivingAccount:'Equity account ending 1234'}
test('administrator records, retries and corrects details without losing history',async()=>{const {db,sql}=setup();const a=await saveDetails(db,'admin',request);assert.equal((await saveDetails(db,'admin',request)).id,a.id);await assert.rejects(()=>saveDetails(db,'admin',{...request,purpose:'Changed'}));const b=await saveDetails(db,'admin',{...request,requestKey:key2,expectedRevision:a.id,purpose:'Revised'});const history=await listDetails(db,'admin','booking');assert.deepEqual(history.map(x=>x.id),[b.id,a.id]);assert.equal(history[1].purpose,'Business');await assert.rejects(()=>saveDetails(db,'admin',{...request,requestKey:'33333333-3333-4333-8333-333333333333',expectedRevision:a.id}));assert.throws(()=>sql.exec("DELETE FROM credit_request_details"));sql.close()})
test('requires admin and valid booking; legacy bookings have no details',async()=>{const {db,sql}=setup();assert.deepEqual(await listDetails(db,'admin','booking'),[]);await assert.rejects(()=>listDetails(db,'member','booking'),/Unauthorized/);await assert.rejects(()=>saveDetails(db,'member',request),/Unauthorized/);await assert.rejects(()=>saveDetails(db,'admin',{...request,bookingId:'missing'}));await assert.rejects(()=>saveDetails(db,'admin',{...request,receivingAccount:'x'.repeat(2001)}));sql.close()})
test('histories and revisions remain scoped to their booking',async()=>{
 const {db,sql}=setup();sql.exec("INSERT INTO credit_bookings VALUES('other')")
 const first=await saveDetails(db,'admin',request)
 const other=await saveDetails(db,'admin',{...request,bookingId:'other',requestKey:key2,receivingAccount:'Other account'})
 assert.equal((await listDetails(db,'admin','booking'))[0].receivingAccount,'Equity account ending 1234')
 assert.equal((await listDetails(db,'admin','other'))[0].receivingAccount,'Other account')
 await assert.rejects(()=>saveDetails(db,'admin',{...request,bookingId:'other',requestKey:'33333333-3333-4333-8333-333333333333',expectedRevision:first.id}))
 assert.deepEqual((await listDetails(db,'admin','other')).map(x=>x.id),[other.id])
 sql.exec("DELETE FROM app_user_roles WHERE user_id='admin'")
 await assert.rejects(()=>listDetails(db,'admin','booking'),/Unauthorized/)
 await assert.rejects(()=>saveDetails(db,'admin',request),/Unauthorized/)
 sql.close()
})
