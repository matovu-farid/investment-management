import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { addPledge, addRecoveryEvent, listCollateral } from '../../src/server/collateral/service.ts'
import { createCollateralRepository } from '../../src/server/collateral/repository.ts'
const key='9c11a6a1-82ef-43ea-b2b0-d8c2c6d5d57e'
const pledge={requestKey:key,loanId:'loan',holder:'Member',shares:'100',pledgedDate:'2026-01-01',reference:'Minutes',evidence:'Original pledge document'}
function setup(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('migrations/0002_domain.sql','utf8'));db.exec(readFileSync('migrations/0014_collateral.sql','utf8'))
 db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE collateral_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)")
 db.exec("CREATE TABLE app_user_roles(user_id TEXT PRIMARY KEY, role TEXT); INSERT INTO app_user_roles VALUES ('admin','admin'),('member','member'); INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','Member','admin'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('loan','m',100,'UGX','2026-01-01','test','admin');")
 type Statement={sql:string;args:unknown[];bind:(...args:unknown[])=>Statement;run:()=>Promise<{meta:{changes:number|bigint}}>;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const adapter={prepare(sql:string):Statement{return {sql,args:[],bind(...args){this.args=args;return this},async run(){const r=db.prepare(this.sql).run(...this.args as never[]);return {meta:{changes:r.changes}}},async first(){return db.prepare(this.sql).get(...this.args as never[])??null},async all(){return {results:db.prepare(this.sql).all(...this.args as never[])}}}},async batch(statements:Statement[]){return statements.map(s=>({results:db.prepare(s.sql).all(...s.args as never[])}))}}
 return {db,adapter,repo:createCollateralRepository(adapter as unknown as D1Database)}
}
test('only administrators may read or record collateral facts',async()=>{const {db,repo}=setup();await assert.rejects(listCollateral(repo,'member'),/unauthorized/i);await assert.rejects(addPledge(repo,null,pledge),/unauthorized/i);db.close()})
test('records a pledge once, rejecting altered retries and unknown loans',async()=>{const {db,repo}=setup();const a=await addPledge(repo,'admin',pledge);const b=await addPledge(repo,'admin',pledge);assert.equal(a.id,b.id);await assert.rejects(addPledge(repo,'admin',{...pledge,shares:'101'}),/different/i);await assert.rejects(addPledge(repo,'admin',{...pledge,loanId:'missing',requestKey:'7e67bd0b-28b4-4ced-8007-b6bdfb018551'}));assert.equal((await listCollateral(repo,'admin')).pledges.length,1);assert.throws(()=>db.exec("UPDATE loan_pledges SET holder='changed'"),/immutable/i);assert.throws(()=>db.exec('DELETE FROM loan_pledges'),/immutable/i);db.close()})
test('validates dates and positive whole shares; recovery records are append-only and idempotent',async()=>{const {db,repo}=setup();for(const patch of [{shares:'0'},{shares:'1.5'},{pledgedDate:'2026-02-30'},{holder:''}]) await assert.rejects(addPledge(repo,'admin',{...pledge,...patch}));const event={requestKey:key,loanId:'loan',eventDate:'2026-03-01',description:'Board reviewing recovery'};const a=await addRecoveryEvent(repo,'admin',event);const b=await addRecoveryEvent(repo,'admin',event);assert.equal(a.id,b.id);await assert.rejects(addRecoveryEvent(repo,'admin',{...event,description:'Different'}),/different/i);assert.throws(()=>db.exec("UPDATE loan_recovery_events SET description='changed'"),/immutable/i);assert.throws(()=>db.exec('DELETE FROM loan_recovery_events'),/immutable/i);db.close()})

test('a retained pledge can be retried after reload without duplicate records',async()=>{
 const {createPendingStore}=await import('../../src/lib/pending-requests/store.ts')
 const {db,repo}=setup(); const values=new Map<string,string>()
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}}
 const first=createPendingStore<{idempotencyKey:string;loanId:string;holder:string;shares:string;pledgedDate:string;reference:string;evidence:string}>(storage,'admin','collateral-pledge')
 const payload={idempotencyKey:key,loanId:pledge.loanId,holder:pledge.holder,shares:pledge.shares,pledgedDate:pledge.pledgedDate,reference:pledge.reference,evidence:pledge.evidence}
 first.begin(payload)
 const saved=await addPledge(repo,'admin',{...payload,requestKey:payload.idempotencyKey})
 // Simulate losing the response and reloading the same tab before retrying.
 const reloaded=createPendingStore<typeof payload>(storage,'admin','collateral-pledge');const pending=reloaded.read();assert.ok(pending)
 const retry=await addPledge(repo,'admin',{...pending,requestKey:pending.idempotencyKey});assert.equal(retry.id,saved.id)
 reloaded.confirm(pending.idempotencyKey);assert.equal(reloaded.read(),null)
 assert.equal((db.prepare('SELECT count(*) AS n FROM loan_pledges').get() as {n:number}).n,1);db.close()
})

test('void loans do not appear as available collateral targets',async()=>{const {db,repo}=setup();db.exec("INSERT INTO loan_source_voids VALUES ('loan','loan','error','2026-11-05')");assert.equal((await listCollateral(repo,'admin')).loans.length,0);db.close()})

test('role revoked after the preliminary check cannot disclose collateral lists',async()=>{
 const {db,repo}=setup();const raced={...repo,async roleFor(id:string){const role=await repo.roleFor(id);db.exec("UPDATE app_user_roles SET role='member' WHERE user_id='admin'");return role}}
 await assert.rejects(listCollateral(raced,'admin'),/unauthorized/i);db.close()
})
test('role revoked after the preliminary check cannot record pledge or recovery facts',async()=>{
 for(const kind of ['pledge','event'] as const){const {db,repo}=setup();const raced={...repo,async roleFor(id:string){const role=await repo.roleFor(id);db.exec("UPDATE app_user_roles SET role='member' WHERE user_id='admin'");return role}}
  if(kind==='pledge')await assert.rejects(addPledge(raced,'admin',pledge));else await assert.rejects(addRecoveryEvent(raced,'admin',{requestKey:key,loanId:'loan',eventDate:'2026-03-01',description:'Review'}))
  const table=kind==='pledge'?'loan_pledges':'loan_recovery_events';assert.equal((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n,0);db.close()
 }
})
test('role revoked after a pledge write cannot read confirmation, and a later authorized retry is safe',async()=>{
 const {db,adapter}=setup()
 const racedDb={...adapter,prepare(sql:string){const stmt=adapter.prepare(sql);if(sql.startsWith('INSERT INTO loan_pledges')){const original=stmt.run;stmt.run=async function(){const result=await original.call(this);db.exec("UPDATE app_user_roles SET role='member' WHERE user_id='admin'");return result}}return stmt}}
 await assert.rejects(addPledge(createCollateralRepository(racedDb as unknown as D1Database),'admin',pledge),/unavailable/i)
 assert.equal((db.prepare('SELECT count(*) AS n FROM loan_pledges').get() as {n:number}).n,1)
 db.exec("UPDATE app_user_roles SET role='admin' WHERE user_id='admin'")
 await addPledge(createCollateralRepository(adapter as unknown as D1Database),'admin',pledge)
 assert.equal((db.prepare('SELECT count(*) AS n FROM loan_pledges').get() as {n:number}).n,1);db.close()
})
test('history identifies the parent loan and its void after it leaves the active selector',async()=>{const {db,repo}=setup();await addPledge(repo,'admin',pledge);await addRecoveryEvent(repo,'admin',{requestKey:'7e67bd0b-28b4-4ced-8007-b6bdfb018551',loanId:'loan',eventDate:'2026-03-01',description:'Review'});db.exec("INSERT INTO loan_source_voids VALUES ('loan','loan','data correction','2026-11-05')");const result=await listCollateral(repo,'admin');assert.equal(result.loans.length,0);for(const item of [result.pledges[0],result.events[0]]){assert.equal(item.parentMemberName,'Member');assert.equal(item.parentMemberNumber,'001');assert.equal(item.loanVoidedAt,'2026-11-05');assert.equal(item.loanVoidReason,'data correction')}db.close()})
