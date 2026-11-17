import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { createPolicyRepository } from '../../src/server/policy/repository.ts'
test('retries reuse the same target and reject changed data',async()=>{
 const db=new DatabaseSync(':memory:'); db.exec(readFileSync('migrations/0002_domain.sql','utf8')); db.exec(readFileSync('migrations/0013_policy_idempotency.sql','utf8'));db.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin')")
 db.exec(readFileSync('migrations/0096_policy_corrections.sql','utf8'))
 db.exec(readFileSync('migrations/0097_policy_identity_corrections.sql','utf8'))
 let revokeAt=''
 const adapter={prepare(sql:string){ return {bind(...params:unknown[]){const stmt=db.prepare(sql);const revoke=()=>{if(revokeAt&&sql.includes(revokeAt)){revokeAt='';db.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}};return {async run(){revoke();return stmt.run(...params as never[])},async first(){revoke();return stmt.get(...params as never[])??null},async all(){revoke();return {results:stmt.all(...params as never[])}}}}} }}
 const repo=createPolicyRepository(adapter as unknown as D1Database)
 const item={id:'one',assetClass:'Bonds',effectiveDate:'2026-01-01',minBasisPoints:1000,maxBasisPoints:3000,targetBasisPoints:null,source:'IPS',notes:null,createdBy:'admin'}
 assert.deepEqual({...await repo.create(item,'key')},item)
 assert.deepEqual({...await repo.create({...item,id:'two'},'key')},item)
 await assert.rejects(repo.create({...item,id:'three',maxBasisPoints:4000},'key'),/different details/i)
 revokeAt='INSERT INTO policy_targets';await assert.rejects(repo.create({...item,id:'four'},'second'));assert.equal((db.prepare('SELECT count(*) n FROM policy_targets').get() as {n:number}).n,1)
 db.exec("INSERT INTO app_user_roles VALUES('admin','admin')")
 revokeAt='WHERE request_key=?';await assert.rejects(repo.create(item,'key'))
 db.exec("INSERT INTO app_user_roles VALUES('admin','admin')")
 revokeAt='FROM effective_policy_targets WHERE';assert.deepEqual(await repo.list('admin'),[])
 assert.equal((db.prepare('SELECT count(*) n FROM policy_targets').get() as {n:number}).n,1)
})
