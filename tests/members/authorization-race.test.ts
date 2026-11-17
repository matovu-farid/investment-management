import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { createMemberRepository } from '../../src/server/members/repository.ts'
import { createMember, listMembers } from '../../src/server/members/service.ts'

function fixture(populated:boolean,revoke=true){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql']) sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap');`)
 if(populated)sql.exec("INSERT INTO members(id,member_number,full_name,email,status,created_by) VALUES('m','M1','Private member','private@example.test','active','admin')")
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 let revoked=false
 const db={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){const row=sql.prepare(this.query).get(...this.values as never[])??null;if(revoke&&!revoked&&this.query.includes('SELECT role FROM app_user_roles')){sql.exec("DELETE FROM app_user_roles WHERE user_id='admin'");revoked=true}return row},async all(){return {results:sql.prepare(this.query).all(...this.values as never[])}},async run(){return sql.prepare(this.query).run(...this.values as never[])}}},async batch(stmts:Stmt[]){if(revoke&&!revoked){sql.exec("DELETE FROM app_user_roles WHERE user_id='admin'");revoked=true}return stmts.map(s=>({results:sql.prepare(s.query).all(...s.values as never[])}))}} as unknown as D1Database
 return {sql,repo:createMemberRepository(db)}
}

for(const populated of [false,true])test(`member list rejects revocation before its guarded read (${populated?'populated':'empty'})`,async()=>{const {sql,repo}=fixture(populated);await assert.rejects(listMembers(repo,'admin'),/unauthorized/i);sql.close()})
test('member creation rejects revocation after role check without a partial record',async()=>{const {sql,repo}=fixture(false);await assert.rejects(createMember(repo,'admin',{memberNumber:'2',fullName:'Test'}),/unauthorized/i);assert.equal((sql.prepare('SELECT count(*) AS n FROM members').get() as {n:number}).n,0);sql.close()})
test('an active administrator can create and list members',async()=>{const {sql,repo}=fixture(false,false);const created=await createMember(repo,'admin',{memberNumber:'2',fullName:'Test'});assert.equal((await listMembers(repo,'admin'))[0].id,created.id);sql.close()})
test('member list performs one guarded database batch without a role preflight',async()=>{const {sql,repo}=fixture(false,false);repo.roleFor=async()=>{throw new Error('unexpected role preflight')};assert.deepEqual(await listMembers(repo,'admin'),[]);sql.close()})
