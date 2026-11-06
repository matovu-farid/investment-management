import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {createPendingStore} from '../../src/lib/pending-requests/store.ts'
import {createSharesRepository} from '../../src/server/shares/repository.ts'
import {createJointHolding,createShareEvent} from '../../src/server/shares/service.ts'
function memory(){const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}}}
test('lost responses for share event and joint holding retry after reload without duplicates',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0006_share_idempotency.sql','0065_joint_review.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec('CREATE TABLE share_event_voids(id TEXT,event_id TEXT,reason TEXT,created_at TEXT)')
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','u');INSERT INTO members(id,member_number,full_name,created_by) VALUES('m1','1','One','u'),('m2','2','Two','u')`)
 type Stmt={sql:string;args:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 const adapter={prepare(sql:string):Stmt{return {sql,args:[],bind(...args){this.args=args;return this},async first(){return db.prepare(sql).get(...this.args as never[])??null},async all(){return {results:db.prepare(sql).all(...this.args as never[])}},async run(){return db.prepare(sql).run(...this.args as never[])}}},async batch(ss:Stmt[]){db.exec('BEGIN');try{for(const s of ss)db.prepare(s.sql).run(...s.args as never[]);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}} as unknown as D1Database
 const repo=createSharesRepository(adapter),storage=memory()
 const event={idempotencyKey:'event-key',memberId:'m1',jointHoldingId:null,eventType:'opening',shares:10,eventDate:'2026-01-01',reference:'',notes:'test'}
 const joint={idempotencyKey:'joint-key',name:'Joint',members:[{id:'m1',memberNumber:'1',fullName:'One'},{id:'m2',memberNumber:'2',fullName:'Two'}]}
 const pendingEvent=createPendingStore<typeof event>(storage,'u','share-event');pendingEvent.begin(event)
 await createShareEvent(repo,'u',{...event,requestId:event.idempotencyKey})
 const reloadedEvent=createPendingStore<typeof event>(storage,'u','share-event'),eventRetry=reloadedEvent.read();assert.deepEqual(eventRetry,event)
 await createShareEvent(repo,'u',{...eventRetry,requestId:eventRetry!.idempotencyKey});reloadedEvent.confirm(event.idempotencyKey)
 const pendingJoint=createPendingStore<typeof joint>(storage,'u','joint-holding');pendingJoint.begin(joint)
 await createJointHolding(repo,'u',{...joint,requestId:joint.idempotencyKey})
 const reloadedJoint=createPendingStore<typeof joint>(storage,'u','joint-holding'),jointRetry=reloadedJoint.read();assert.deepEqual(jointRetry,joint)
 await createJointHolding(repo,'u',{...jointRetry,requestId:jointRetry!.idempotencyKey});reloadedJoint.confirm(joint.idempotencyKey)
 assert.equal((db.prepare('SELECT count(*) n FROM share_events').get() as {n:number}).n,1);assert.equal((db.prepare('SELECT count(*) n FROM joint_shareholdings').get() as {n:number}).n,1);assert.equal((db.prepare('SELECT count(*) n FROM joint_shareholding_members').get() as {n:number}).n,2);db.close()
})
