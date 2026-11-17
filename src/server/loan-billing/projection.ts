import {projectRepaymentSchedule} from '../../lib/loan-billing/projection.ts'
import {listLoanBilling} from './service.ts'

function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid forecast');return value as Record<string,unknown>}
function text(value:unknown){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>128)throw new Error('Invalid forecast');return value}

/** A read-only forecast over one consistent, administrator-authorized billing snapshot. */
export async function projectLoanSchedule(db:D1Database,actorId:string|null,input:unknown){
 const v=object(input),loanId=text(v.loanId),asOfDate=text(v.asOfDate),firstDueDate=text(v.firstDueDate),cadenceMonths=v.cadenceMonths,installments=v.installments,principalStyle=v.principalStyle
 if(![1,2,6].includes(Number(cadenceMonths))||typeof cadenceMonths!=='number'||!Number.isInteger(installments)||Number(installments)<1||Number(installments)>120||!['end','equal'].includes(String(principalStyle)))throw new Error('Invalid forecast assumptions')
 async function capture(){const all=await listLoanBilling(db,actorId);const openingExists=await db.prepare("SELECT 1 AS ok FROM loan_openings WHERE loan_id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(loanId,actorId).first();return {loan:all.loans.find(x=>x.id===loanId),config:all.configs.find(x=>x.loanId===loanId),revision:all.revisions.find(x=>x.loanId===loanId),opening:all.openings.find(x=>x.loanId===loanId),openingExists:!!openingExists,events:all.events.filter(x=>x.loanId===loanId),repayments:all.repayments.filter(x=>x.loanId===loanId&&!x.voided),rateChanges:all.rateChanges.filter(x=>x.loanId===loanId&&!x.voidedAt),legacyReviews:all.legacyReviews.filter(x=>x.loanId===loanId)}}
 const state=await capture(),{loan,config,opening,events,repayments}=state
 if(!loan||!config||!state.revision)throw new Error('A configured, active loan is required')
 if(state.legacyReviews.some(x=>x.configRequestKey===config.requestKey&&!x.valid))throw new Error('Legacy billing review must be corrected before forecasting')
 if(state.openingExists&&!opening)throw new Error('Review the brought-forward billing opening first')
 if(opening&&(opening.cutoffRateBasisPoints==null||opening.cutoffPeriodDays==null))throw new Error('Review the brought-forward cutoff rate first')
 if(events.some(x=>x.eventDate>asOfDate)||repayments.some(x=>x.date>asOfDate))throw new Error('A recorded billing event or repayment is later than the review date')
 if(repayments.some(x=>!events.some(e=>e.repaymentId===x.id)))throw new Error('Finalize recorded repayments before preparing a forecast')
 const payments=repayments.map(x=>({id:x.id,date:x.date,amountMinor:x.amountMinor})),changes=state.rateChanges.map(x=>({effectiveDate:x.effectiveDate,rateBasisPoints:x.rateBasisPoints,periodDays:x.periodDays}))
 const common={disbursementDate:config.disbursementDate,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,repayments:payments,rateChanges:changes,asOfDate,firstDueDate,cadenceMonths:cadenceMonths as 1|2|6,installments:Number(installments),principalStyle:principalStyle as 'end'|'equal'}
 const result=opening?projectRepaymentSchedule({...common,kind:'opening',originalPrincipalMinor:config.principalMinor,openingDate:opening.openingDate,openingPrincipalMinor:opening.principalMinor,openingInterestDueMinor:opening.interestDueMinor,openingRecognizedInterestMinor:opening.recognizedInterestMinor,minimumAssessed:!!opening.minimumAssessed,cutoffRateBasisPoints:opening.cutoffRateBasisPoints!,cutoffPeriodDays:opening.cutoffPeriodDays!}):projectRepaymentSchedule({...common,kind:'original',principalMinor:config.principalMinor})
 const checked=await capture();if(JSON.stringify(state)!==JSON.stringify(checked))throw new Error('Loan records changed during the forecast; calculate again')
 return {...result,asOfDate,firstDueDate,cadenceMonths:Number(cadenceMonths),installments:Number(installments),principalStyle:principalStyle as 'end'|'equal',currency:loan.currency,revision:state.revision.revision}
}
