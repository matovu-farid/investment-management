import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {getDashboard} from '../../src/server/dashboard/service.ts'
import {createDashboardRepository} from '../../src/server/dashboard/repository.ts'

test('admin sees factual counts; members and unauthenticated users receive no group counts',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)")
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1),('m','Member','m@example.test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a');INSERT INTO members(id,member_number,full_name,status,created_by) VALUES('m1','1','One','active','a'),('m2','2','Two','inactive','a');INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m1',100,'UGX','2026-01-01','Terms','a');INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES('b1','m1',100,'UGX','2026-01-01','waiting','a'),('b2','m1',100,'UGX','2026-01-01','held','a'),('b3','m1',100,'UGX','2026-01-01','closed','a');INSERT INTO investments(id,name,asset_class,currency,status,created_by) VALUES('i','Bond','Bond','UGX','closed','a');`)
 const adapter={prepare(sql:string){let args:unknown[]=[];return {bind(...v:unknown[]){args=v;return this},async first(){return db.prepare(sql).get(...args as never[])??null}}}} as unknown as D1Database
 const repo=createDashboardRepository(adapter)
 assert.deepEqual(await getDashboard(repo,'a'),{kind:'admin',counts:{activeMembers:1,loans:1,waitingBookings:1,heldBookings:1,investments:1}})
 db.exec("INSERT INTO loan_source_voids VALUES ('loan','l','error','2026-11-05')");assert.equal((await repo.counts('a')).loans,0)
 assert.deepEqual(await getDashboard(repo,'m'),{kind:'member'})
 await assert.rejects(getDashboard(repo,null),/unauthorized/i)
 db.close()
})
test('failed counts are shown as unavailable to admins without leaking counts to members',async()=>{
 let called=0;const repo={roleFor:async(id:string)=>id==='a'?'admin':null,counts:async()=>{called++;throw new Error('offline')}}
 assert.deepEqual(await getDashboard(repo,'m'),{kind:'member'});assert.equal(called,0)
 assert.deepEqual(await getDashboard(repo,'a'),{kind:'admin',counts:null});assert.equal(called,1)
})

test('revocation before the count query cannot return group totals',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); INSERT INTO \"user\"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','a')")
 let observed:unknown='not queried'
 const adapter={prepare(query:string){let args:unknown[]=[];return {bind(...v:unknown[]){args=v;return this},async first(){if(query.includes('COUNT(*)')){db.exec("DELETE FROM app_user_roles WHERE user_id='a'");observed=db.prepare(query).get(...args as never[])??null;return observed}return db.prepare(query).get(...args as never[])??null}}}} as unknown as D1Database
 const result=await getDashboard(createDashboardRepository(adapter),'a')
 assert.equal(observed,null)
 assert.deepEqual(result,{kind:'admin',counts:null})
 db.close()
})
