import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {captureCreditRisk} from '../../src/server/credit-risk/capture.ts'
import {startBoardRiskCapture,advanceBoardRiskCapture,completedBoardRiskCapture} from '../../src/server/board-packets/risk-capture.ts'

function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+file,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@test',1,1),('b','Admin','b@test',1,1),('u','User','u@test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a'),('b','admin','a');`)
 const stmt=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return stmt(q,p)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args as never[]).changes)}}}})
 const db={prepare:(q:string)=>stmt(q)} as unknown as D1Database
 let version='one'
 const review=async(_db:D1Database,_actor:string|null,input:unknown)=>{const v=input as {currency:string;asOfDate:string;offset:number;expectedFingerprint?:string};return captureCreditRisk(v.currency,v.asOfDate,{readState:async()=>({version,loans:Array.from({length:6},(_,i)=>({id:`loan-${i}`,currency:'UGX',disbursementDate:'2020-01-01'}))}),readBalance:async()=>({principalMinor:'10',interestMinor:'0'}),readRisk:async()=>'mild' as const,readPlanTokens:async()=>'plan',clock:()=>new Date('2026-08-31T10:00:00Z')},{offset:v.offset,expectedFingerprint:v.expectedFingerprint})}
 return {sql,db,review,change:()=>{version='two'}}
}
test('only the owner can complete sequential pages and freeze a complete profile',async()=>{
 const {sql,db,review}=fixture()
 await assert.rejects(startBoardRiskCapture(db,'u',{currency:'UGX',asOfDate:'2026-08-31'},review),/unauthorized/i)
 const first=await startBoardRiskCapture(db,'a',{currency:'UGX',asOfDate:'2026-08-31'},review)
 assert.equal(first.profile.nextOffset,5)
 await assert.rejects(completedBoardRiskCapture(db,'a',first.id,'2026-08-31'),/incomplete/i)
 await assert.rejects(advanceBoardRiskCapture(db,'b',{id:first.id,expectedOffset:5},review),/unavailable/i)
 await assert.rejects(advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:10},review),/changed|order/i)
 const final=await advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5},review)
 assert.equal(final.profile.nextOffset,null);assert.equal(final.profile.totalMinor,'60')
 assert.equal((await completedBoardRiskCapture(db,'a',first.id,'2026-08-31')).totalMinor,'60')
 await assert.rejects(completedBoardRiskCapture(db,'a',first.id,'2026-08-30'),/date/i)
 await assert.rejects(advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5},review),/changed|complete/i)
 sql.close()
})
test('changed sources, expiry and revoked access prevent completing a capture',async()=>{
 const {sql,db,review,change}=fixture();const first=await startBoardRiskCapture(db,'a',{currency:'UGX',asOfDate:'2026-08-31'},review);change()
 await assert.rejects(advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5},review),/changed/i)
 sql.prepare("UPDATE board_risk_captures SET created_at='2000-01-01 00:00:00' WHERE id=?").run(first.id)
 await assert.rejects(advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5},review),/unavailable/i)
 sql.exec("DELETE FROM app_user_roles WHERE user_id='a'")
 await assert.rejects(completedBoardRiskCapture(db,'a',first.id,'2026-08-31'),/unauthorized/i)
 sql.close()
})
test('concurrent page advances cannot append the same page twice',async()=>{
 const {sql,db,review}=fixture(),first=await startBoardRiskCapture(db,'a',{currency:'UGX',asOfDate:'2026-08-31'},review)
 let waiting=0,release!:()=>void;const both=new Promise<void>(r=>{release=r})
 const synchronized:typeof review=async(...args)=>{if(++waiting===2)release();await both;return review(...args)}
 const results=await Promise.allSettled([advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5},synchronized),advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5},synchronized)])
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 assert.equal(results.filter(r=>r.status==='rejected').length,1)
 assert.equal((await completedBoardRiskCapture(db,'a',first.id,'2026-08-31')).totalMinor,'60')
 sql.close()
})
