import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {test} from 'node:test'
import {createBookingHistoryRepository} from '../../src/server/booking-history/repository.ts'
import {addStatusEvent,listBookingHistory} from '../../src/server/booking-history/service.ts'

test('booking history refuses a revoked administrator, including empty results',async()=>{
 for(const populated of [false,true]){
  const sql=new DatabaseSync(':memory:');for(const f of ['0002_domain.sql','0020_booking_history.sql'])sql.exec(readFileSync(`migrations/${f}`,'utf8'))
  sql.exec("CREATE TABLE app_user_roles(user_id TEXT PRIMARY KEY,role TEXT);INSERT INTO app_user_roles VALUES('a','admin')")
  if(populated)sql.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','a');INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES('b','m',100,'UGX','2026-01-01','waiting','a');INSERT INTO booking_status_events(id,booking_id,event_type,event_date,reason,created_by,request_key) VALUES('e','b','held','2026-01-02','test','a','k')")
  const adapter={prepare(q:string){let args:unknown[]=[];return {bind(...a:unknown[]){args=a;return this},async first(){const result=sql.prepare(q).get(...args as never[])??null;if(q==='SELECT role FROM app_user_roles WHERE user_id=?')sql.exec("DELETE FROM app_user_roles WHERE user_id='a'");return result},async all(){return {results:sql.prepare(q).all(...args as never[])}}}},async batch(stmts:{all:()=>Promise<unknown>}[]){return Promise.all(stmts.map(x=>x.all()))}}
  await assert.rejects(listBookingHistory(createBookingHistoryRepository(adapter as unknown as D1Database),'a'),/unauthorized/i)
  sql.close()
 }
})

test('booking history refuses to append an event after administrator revocation',async()=>{
 const sql=new DatabaseSync(':memory:');for(const f of ['0002_domain.sql','0020_booking_history.sql'])sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec("CREATE TABLE app_user_roles(user_id TEXT PRIMARY KEY,role TEXT);INSERT INTO app_user_roles VALUES('a','admin');INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','a');INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES('b','m',100,'UGX','2026-01-01','waiting','a')")
 const adapter={prepare(q:string){let args:unknown[]=[];return {bind(...a:unknown[]){args=a;return this},async first(){const result=sql.prepare(q).get(...args as never[])??null;if(q==='SELECT role FROM app_user_roles WHERE user_id=?')sql.exec("DELETE FROM app_user_roles WHERE user_id='a'");return result},async run(){return sql.prepare(q).run(...args as never[])}}}}
 await assert.rejects(addStatusEvent(createBookingHistoryRepository(adapter as unknown as D1Database),'a',{bookingId:'b',eventType:'held',eventDate:'2026-01-02',reason:'Test',requestKey:'b75610af-140f-46d8-ac6c-a4be05c42b01'}),/unauthorized|different/i)
 assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM booking_status_events').get() as {n:number}).n,0);sql.close()
})
