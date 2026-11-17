import {calculateLoanBilling} from '../../lib/loan-billing/billing.ts'
import {calculateOpeningLoanBilling} from '../../lib/loan-billing/opening.ts'
import {repaymentsMatchLedger} from '../loan-billing/repayment-evidence.ts'
import type {CreditReview} from '../credit-review/service.ts'
import type {listLoanBilling} from '../loan-billing/service.ts'
type Data=Awaited<ReturnType<typeof listLoanBilling>>
type Input={memberId:string;asOf:string;observationId:string;valueId:string;limitBasisPoints:number;review:CreditReview;billing:Data;openingLoanIds?:string[];validJournalIds?:string[]}
/** Provisional review of current records, not an approval or historical reconstruction. */
export function calculateCapacity({memberId,asOf,observationId,valueId,limitBasisPoints,review,billing,openingLoanIds=[],validJournalIds=[]}:Input){
 if(!Number.isInteger(limitBasisPoints)||limitBasisPoints<0||limitBasisPoints>10000)throw new Error('Invalid limit percentage')
 const o=review.holdings.find(x=>x.id===observationId),v=review.shareValues.find(x=>x.id===valueId),h=review.holdingPublications.find(x=>x.id===v?.holdingPublicationId)
 if(!o||o.kind!=='individual'||o.voidedAt||!v||v.kind!=='individual'||v.withdrawnAt||v.holdingWithdrawnAt||!h||h.withdrawnAt||h.observationId!==o.id||v.observedDate!==o.observedDate||v.shares!==o.shares)throw new Error('Selected holding or value unavailable; review again')
 if(o.observedDate>asOf||v.priceDate>asOf)throw new Error('Holding and price dates must be on or before the review date')
 if(review.holdings.some(x=>x.kind==='individual'&&!x.voidedAt&&x.observedDate>o.observedDate&&x.observedDate<=asOf)||(review.shareEvents??[]).some(e=>e.kind==='individual'&&!e.voidedAt&&e.eventDate>=o.observedDate&&e.eventDate<=asOf))throw new Error('Holding may be stale: reconcile later observations and same-day or later share events before calculating')
 const value=BigInt(o.shares)*BigInt(v.priceMinor),limit=value*BigInt(limitBasisPoints)/10000n
 const exposureResult=calculateMemberExposure({memberId,asOf,currency:v.currency,review,billing,openingLoanIds,validJournalIds})
 const remaining=limit-BigInt(exposureResult.exposureMinor)
 return {currency:v.currency,asOf,holdingValueMinor:String(value),limitMinor:String(limit),exposureMinor:exposureResult.exposureMinor,remainingMinor:exposureResult.complete?String(remaining>0n?remaining:0n):null,excessMinor:exposureResult.complete?String(remaining<0n?-remaining:0n):null,eligible:exposureResult.eligible,included:exposureResult.included,omitted:exposureResult.omitted}
}


type ExposureInput={memberId:string;asOf:string;currency:string;review:CreditReview;billing:Data;openingLoanIds?:string[];validJournalIds?:string[]}
/** Shared exposure calculation, independent of shareholding valuation. */
export function calculateMemberExposure({memberId,asOf,currency,review,billing,openingLoanIds=[],validJournalIds=[]}:ExposureInput){
 const loans=billing.loans.filter(l=>l.memberId===memberId&&l.disbursementDate<=asOf),omitted={otherCurrency:0,unconfigured:0,pendingRepayments:0,unavailable:0};let exposure=0n,included=0
 for(const loan of loans){
  if(loan.currency!==currency){omitted.otherCurrency++;continue}
  const config=billing.configs.find(c=>c.loanId===loan.id),revision=billing.revisions.find(r=>r.loanId===loan.id),opening=billing.openings.find(x=>x.loanId===loan.id)
  if(!config){omitted.unconfigured++;continue}
  if(!revision||openingLoanIds.includes(loan.id)&&!opening||((review.termChanges??[]).some(t=>t.loanId===loan.id&&!t.voidedAt&&t.effectiveDate<=asOf)&&!(billing.legacyReviews??[]).some(r=>r.configRequestKey===config.requestKey&&r.valid===1))||(billing.legacyReviews??[]).some(r=>r.configRequestKey===config.requestKey&&!r.valid)){omitted.unavailable++;continue}
  const payments=billing.repayments.filter(p=>p.loanId===loan.id&&!p.voided&&p.date<=asOf),events=billing.events.filter(e=>e.loanId===loan.id)
  if(payments.some(p=>!events.some(e=>e.repaymentId===p.id))){omitted.pendingRepayments++;continue}
  try {if(opening&&(opening.cutoffRateBasisPoints==null||opening.cutoffPeriodDays==null))throw new Error('Legacy opening cutoff rate must be reviewed');const rateChanges=(billing.rateChanges??[]).filter(c=>c.loanId===loan.id&&!c.voidedAt).map(c=>({effectiveDate:c.effectiveDate,rateBasisPoints:c.rateBasisPoints,periodDays:c.periodDays})),repayments=payments.map(p=>({id:p.id,date:p.date,amountMinor:p.amountMinor})),result=opening?calculateOpeningLoanBilling({originalPrincipalMinor:config.principalMinor,disbursementDate:config.disbursementDate,openingDate:opening.openingDate,openingPrincipalMinor:opening.principalMinor,openingInterestDueMinor:opening.interestDueMinor,openingRecognizedInterestMinor:opening.recognizedInterestMinor,minimumAssessed:!!opening.minimumAssessed,asOfDate:asOf,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,cutoffRateBasisPoints:opening.cutoffRateBasisPoints??config.rateBasisPoints,cutoffPeriodDays:opening.cutoffPeriodDays??config.periodDays,repayments,rateChanges}):calculateLoanBilling({principalMinor:config.principalMinor,disbursementDate:config.disbursementDate,asOfDate:asOf,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,repayments,rateChanges});if(!repaymentsMatchLedger(payments,events,result.lines,new Set(validJournalIds)))throw new Error('Posted allocation differs from current billing');exposure+=BigInt(result.principalMinor)+BigInt(result.interestDueMinor);included++}catch{omitted.unavailable++}
 }
 return {exposureMinor:String(exposure),complete:Object.values(omitted).every(n=>n===0),eligible:loans.length,included,omitted}
}
