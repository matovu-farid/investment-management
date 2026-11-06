import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { createPolicyRepository } from '../../src/server/policy/repository.ts'
test('retries reuse the same target and reject changed data',async()=>{
 const db=new DatabaseSync(':memory:'); db.exec(readFileSync('migrations/0002_domain.sql','utf8')); db.exec(readFileSync('migrations/0013_policy_idempotency.sql','utf8'))
 const adapter={prepare(sql:string){ return {bind(...params:unknown[]){const stmt=db.prepare(sql);return {async run(){return stmt.run(...params as never[])},async first(){return stmt.get(...params as never[])??null},async all(){return {results:stmt.all(...params as never[])}}}}} }}
 const repo=createPolicyRepository(adapter as unknown as D1Database)
 const item={id:'one',assetClass:'Bonds',effectiveDate:'2026-01-01',minBasisPoints:1000,maxBasisPoints:3000,targetBasisPoints:null,source:'IPS',notes:null,createdBy:'admin'}
 assert.deepEqual({...await repo.create(item,'key')},item)
 assert.deepEqual({...await repo.create({...item,id:'two'},'key')},item)
 await assert.rejects(repo.create({...item,id:'three',maxBasisPoints:4000},'key'),/different details/i)
 assert.equal((db.prepare('SELECT count(*) n FROM policy_targets').get() as {n:number}).n,1)
})
