import {getCreditReview} from '../credit-review/service.ts'
import {listLoanBilling} from '../loan-billing/service.ts'
import {calculateCapacity,calculateMemberExposure} from './calculate.ts'
import {compareDirectorCredit} from '../../lib/credit-capacity-proposal.ts'
import {validRepaymentJournals} from '../loan-billing/repayment-evidence.ts'
function text(v:unknown,max=128){if(typeof v!=='string'||v!==v.trim()||!v||v.length>max)throw new Error('Invalid input');return v}
export async function previewCreditCapacity(db:D1Database,actor:string|null,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid input');const x=input as Record<string,unknown>,memberId=text(x.memberId),observationId=text(x.observationId),valueId=text(x.valueId),asOf=text(x.asOf,10),limitBasisPoints=x.limitBasisPoints
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf||typeof limitBasisPoints!=='number')throw new Error('Invalid date or percentage')
 const today=await db.prepare("SELECT date('now','+3 hours') AS today").first<{today:string}>();if(!today||asOf>today.today)throw new Error('Review date cannot be in the future')
 const capture=()=>captureExposure(db,actor,memberId,asOf)
 const first=await capture();const result=calculateCapacity({memberId,asOf,observationId,valueId,limitBasisPoints,...first});const second=await capture();const fingerprint=(s:typeof first)=>JSON.stringify({...s,review:{...s.review,snapshotAt:''}});if(fingerprint(first)!==fingerprint(second))throw new Error('Records changed during review; calculate again')
 const observation=first.review.holdings.find(x=>x.id===observationId)!,value=first.review.shareValues.find(x=>x.id===valueId)!
 return {...result,member:first.review.member,observation,value,limitBasisPoints,capturedAt:second.review.snapshotAt}
}

async function captureExposure(db:D1Database,actor:string|null,memberId:string,asOf:string){
 const review=await getCreditReview(db,actor,{memberId}),billing=await listLoanBilling(db,actor)
 const openingLoanIds=(await db.prepare("SELECT o.loan_id AS id FROM loan_openings o JOIN loans l ON l.id=o.loan_id WHERE l.member_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY o.loan_id").bind(memberId,actor).all<{id:string}>()).results.map(x=>x.id)
 const validJournalIds=await validRepaymentJournals(db,actor,asOf)
 return {review,billing,openingLoanIds,validJournalIds}
}
export async function previewDirectorCapacity(db:D1Database,actor:string|null,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid input')
 const x=input as Record<string,unknown>,memberId=text(x.memberId),asOf=text(x.asOf,10)
 compareDirectorCredit({currency:'UGX',asOf,exposureMinor:'0'})
 const today=await db.prepare("SELECT date('now','+3 hours') AS today").first<{today:string}>();if(!today||asOf>today.today)throw new Error('Review date cannot be in the future')
 const first=await captureExposure(db,actor,memberId,asOf),result=calculateMemberExposure({memberId,asOf,currency:'UGX',...first}),second=await captureExposure(db,actor,memberId,asOf)
 const fingerprint=(s:typeof first)=>JSON.stringify({...s,review:{...s.review,snapshotAt:''}})
 if(fingerprint(first)!==fingerprint(second))throw new Error('Records changed during review; calculate again')
 return {...result,member:first.review.member,asOf,currency:'UGX' as const,capturedAt:second.review.snapshotAt,comparison:result.complete?compareDirectorCredit({currency:'UGX',asOf,exposureMinor:result.exposureMinor}):null}
}
