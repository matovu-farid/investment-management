import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createSharesRepository } from '../../src/server/shares/repository.ts'
test('register retains voided event while create retry reports its void',async()=>{
 const db=new DatabaseSync(':memory:');for(const f of ['0002_domain.sql','0006_share_idempotency.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'));db.exec("CREATE TABLE app_user_roles(user_id TEXT, role TEXT); INSERT INTO app_user_roles VALUES('admin','admin'); CREATE TABLE share_event_voids(id TEXT, event_id TEXT, reason TEXT, created_at TEXT); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','admin')")
 type S={q:string;args:unknown[];bind:(...v:unknown[])=>S;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>};const adapter={prepare(q:string):S{return {q,args:[],bind(...v){this.args=v;return this},async first(){return db.prepare(this.q).get(...this.args as never[])??null},async all(){return {results:db.prepare(this.q).all(...this.args as never[])}},async run(){return db.prepare(this.q).run(...this.args as never[])}}},async batch(stmts:S[]){return Promise.all(stmts.map(async s=>({results:db.prepare(s.q).all(...s.args as never[])})))}} as unknown as D1Database
 const repo=createSharesRepository(adapter), event={id:'s',memberId:'m',jointHoldingId:null,eventType:'opening',shares:10,eventDate:'2026-01-01',reference:null,notes:null,createdBy:'admin',requestId:'request'}
 await repo.createEvent(event);db.exec("INSERT INTO share_event_voids VALUES('v','s','entry mistake','2026-11-05')")
 const list=await repo.list('admin');assert.equal(list.events[0].voidReason,'entry mistake');assert.equal(list.events[0].voidedAt,'2026-11-05');await assert.rejects(repo.createEvent({...event,id:'retry'}),/void/i);db.close()
})
