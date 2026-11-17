import {strict as assert} from 'node:assert'
import {readFileSync,readdirSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {test} from 'node:test'
import {lendingRepository} from '../../src/server/lending/repository.ts'
import {listLending} from '../../src/server/lending/service.ts'

test('lending register refuses a revoked administrator, including empty results',async()=>{
 for(const populated of [false,true]){
  const sql=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(`migrations/${f}`,'utf8'))
  sql.exec("INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','bootstrap')")
  if(populated)sql.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','a');INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES('b','m',100,'UGX','2026-01-01','waiting','a')")
  const adapter={prepare(q:string){let args:unknown[]=[];return {bind(...a:unknown[]){args=a;return this},async first(){const result=sql.prepare(q).get(...args as never[])??null;if(q==='SELECT role FROM app_user_roles WHERE user_id=?')sql.exec("DELETE FROM app_user_roles WHERE user_id='a'");return result},async all(){return {results:sql.prepare(q).all(...args as never[])}}}},async batch(stmts:{all:()=>Promise<unknown>}[]){return Promise.all(stmts.map(x=>x.all()))}}
  await assert.rejects(listLending(lendingRepository(adapter as unknown as D1Database),'a'),/unauthorized/i)
  sql.close()
 }
})
