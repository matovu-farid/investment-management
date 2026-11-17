import {reviewCreditRisk} from '../credit-risk/service.ts'
import {mergeRiskPages} from '../../lib/installment-tracking/risk-pages.ts'

type Page=Awaited<ReturnType<typeof reviewCreditRisk>>
type Reviewer=typeof reviewCreditRisk
type Capture={id:string;profileJson:string;version:number}
async function admin(db:D1Database,actor:string|null){if(!actor||!(await db.prepare("SELECT 1 AS ok WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor).first()))throw new Error('Unauthorized');return actor}
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid capture');return v as Record<string,unknown>}
function id(v:unknown){if(typeof v!=='string'||!/^[a-f0-9-]{36}$/i.test(v))throw new Error('Invalid capture');return v}
async function get(db:D1Database,actor:string,captureId:string){
 const row=await db.prepare("SELECT id,profile_json AS profileJson,version FROM board_risk_captures WHERE id=? AND created_by=? AND created_at>=datetime('now','-1 day') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(captureId,actor,actor).first<Capture>()
 if(!row)throw new Error('Capture unavailable or expired');return {...row,profile:JSON.parse(row.profileJson) as Page}
}
export async function startBoardRiskCapture(db:D1Database,actorId:string|null,input:unknown,review:Reviewer=reviewCreditRisk){
 const actor=await admin(db,actorId),v=obj(input);if(typeof v.currency!=='string'||typeof v.asOfDate!=='string')throw new Error('Invalid currency or date')
 const profile=await review(db,actor,{currency:v.currency,asOfDate:v.asOfDate,offset:0}),captureId:string=crypto.randomUUID()
 await db.prepare("DELETE FROM board_risk_captures WHERE created_at<datetime('now','-1 day') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor).run()
 const result=await db.prepare("INSERT INTO board_risk_captures(id,created_by,profile_json) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(captureId,actor,JSON.stringify(profile),actor).run()
 if(result.meta.changes!==1)throw new Error('Unauthorized');return {id:captureId,profile}
}
export async function advanceBoardRiskCapture(db:D1Database,actorId:string|null,input:unknown,review:Reviewer=reviewCreditRisk){
 const actor=await admin(db,actorId),v=obj(input),captureId=id(v.id),current=await get(db,actor,captureId)
 if(current.profile.nextOffset===null)throw new Error('Capture complete')
 if(v.expectedOffset!==current.profile.nextOffset)throw new Error('Capture changed or page out of order')
 const page=await review(db,actor,{currency:current.profile.currency,asOfDate:current.profile.asOfDate,offset:current.profile.nextOffset,expectedFingerprint:current.profile.fingerprint}),profile=mergeRiskPages(current.profile,page)
 const result=await db.prepare("UPDATE board_risk_captures SET profile_json=?,version=version+1 WHERE id=? AND created_by=? AND version=? AND created_at>=datetime('now','-1 day') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(JSON.stringify(profile),captureId,actor,current.version,actor).run()
 if(result.meta.changes!==1)throw new Error('Capture changed or unavailable');return {id:captureId,profile}
}
export async function completedBoardRiskCapture(db:D1Database,actorId:string|null,captureId:unknown,asOfDate:string){
 const actor=await admin(db,actorId),{profile}=await get(db,actor,id(captureId))
 if(profile.asOfDate!==asOfDate)throw new Error('Risk capture date does not match packet end date')
 if(profile.offset!==0||profile.nextOffset!==null||profile.eligibleCount!==profile.totalEligible||profile.includedCount+profile.unavailableLoanIds.length!==profile.eligibleCount)throw new Error('Risk capture incomplete')
 return profile
}
