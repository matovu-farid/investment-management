import type {Fact} from '../server/reports/service.ts'
const DAY=86_400_000
function parseDay(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const n=Date.parse(`${value}T00:00:00Z`);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null}
/** Age of recorded remainder, not proof of actionable demand or policy compliance. */
export function bookingAgeReview<T extends Fact>(booking:T,asOf:string){
 const start=parseDay(booking.requestedDate),end=parseDay(asOf)
 const elapsedDays=start===null||end===null||start>end?null:(end-start)/DAY
 const remainder=String(booking.remainingMinor),completion=parseDay(booking.completedDate)
 const daysToRecordedCompletion=start!==null&&end!==null&&completion!==null&&completion>=start&&completion<=end?(completion-start)/DAY:null
 let review:string
 if(elapsedDays===null)review='Date unavailable'
 else if(!/^-?\d+$/.test(remainder)||BigInt(remainder)<0n)review='Remainder requires reconciliation'
 else if(asOf<'2025-09-28')review='Policy date not reached'
 else if(BigInt(remainder)===0n)review=daysToRecordedCompletion===null?'Completion date unavailable':daysToRecordedCompletion<=30?'Recorded completion within 30 days':'Recorded completion after 30 days'
 else review=elapsedDays>=30?'30+ days; review remainder':'Under 30 days; review remainder'
 return {...booking,elapsedDays,daysToRecordedCompletion,review}
}
/** Counts recorded rows only; unknown or unavailable rows stay explicit. */
export function summarizeBookingAge(rows:{review:string}[]){
 const summary={total:rows.length,completedWithin30:0,completedAfter30:0,remainderUnder30:0,remainder30OrMore:0,notClassified:0}
 for(const row of rows){
  if(row.review==='Recorded completion within 30 days')summary.completedWithin30++
  else if(row.review==='Recorded completion after 30 days')summary.completedAfter30++
  else if(row.review==='Under 30 days; review remainder')summary.remainderUnder30++
  else if(row.review==='30+ days; review remainder')summary.remainder30OrMore++
  else summary.notClassified++
 }
 return summary
}
