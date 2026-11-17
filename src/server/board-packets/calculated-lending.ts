import {calculateLoanBilling} from '../../lib/loan-billing/billing.ts'
import {calculateOpeningLoanBilling} from '../../lib/loan-billing/opening.ts'
import {listLoanBilling} from '../loan-billing/service.ts'

export type CalculatedLendingSummary={asOf:string;eligible:number;included:number;omitted:{unconfigured:number;pendingRepayments:number;unavailable:number};totals:{currency:string;principalMinor:string;interestMinor:string}[]}
type Data=Awaited<ReturnType<typeof listLoanBilling>>
// Includes even excluded records: a new loan, void, payment, correction, opening,
// or configuration during capture must invalidate the entire reviewed aggregate.
function fingerprint(data:Data,asOf:string){const ids=new Set(data.loans.filter(l=>l.disbursementDate<=asOf).map(l=>l.id));return JSON.stringify({loans:data.loans.filter(l=>ids.has(l.id)),configs:data.configs.filter(c=>ids.has(c.loanId)),repayments:data.repayments.filter(r=>ids.has(r.loanId)),events:data.events.filter(e=>ids.has(e.loanId)),revisions:data.revisions.filter(r=>ids.has(r.loanId)),openings:data.openings.filter(o=>ids.has(o.loanId)),rateChanges:(data.rateChanges??[]).filter(c=>ids.has(c.loanId)),legacyReviews:(data.legacyReviews??[]).filter(c=>ids.has(c.loanId))})}
export {repaymentsMatchLedger} from '../loan-billing/repayment-evidence.ts'
import {repaymentsMatchLedger,validRepaymentJournals} from '../loan-billing/repayment-evidence.ts'
/** Provisional calculation over the current register, not a reconstruction of what was known at the date. */
export async function calculatedLendingSummary(db:D1Database,actorId:string|null,asOf:string):Promise<CalculatedLendingSummary>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)throw new Error('Invalid date')
 const today=await db.prepare("SELECT date('now','+3 hours') AS today").first<{today:string}>();if(!today||asOf>today.today)throw new Error('Calculated lending date cannot be in the future')
 const data=await listLoanBilling(db,actorId),journalIds=await validRepaymentJournals(db,actorId,asOf),validJournals=new Set(journalIds),loans=data.loans.filter(l=>l.disbursementDate<=asOf),omitted={unconfigured:0,pendingRepayments:0,unavailable:0},totals=new Map<string,{principal:bigint;interest:bigint}>();let included=0
 for(const loan of loans){
  const config=data.configs.find(c=>c.loanId===loan.id),revision=data.revisions.find(r=>r.loanId===loan.id)
  if(!config){omitted.unconfigured++;continue}if(!revision){omitted.unavailable++;continue}
  if((data.legacyReviews??[]).some(r=>r.configRequestKey===config.requestKey&&!r.valid)){omitted.unavailable++;continue}const payments=data.repayments.filter(r=>r.loanId===loan.id&&!r.voided&&r.date<=asOf),events=data.events.filter(e=>e.loanId===loan.id)
  if(payments.some(r=>!events.some(e=>e.repaymentId===r.id))){omitted.pendingRepayments++;continue}
  const opening=data.openings.find(o=>o.loanId===loan.id)
  try{if(opening&&(opening.cutoffRateBasisPoints==null||opening.cutoffPeriodDays==null))throw new Error('Legacy opening cutoff rate must be reviewed');const rateChanges=(data.rateChanges??[]).filter(c=>c.loanId===loan.id&&!c.voidedAt).map(c=>({effectiveDate:c.effectiveDate,rateBasisPoints:c.rateBasisPoints,periodDays:c.periodDays})),repayments=payments.map(p=>({id:p.id,date:p.date,amountMinor:p.amountMinor})),result=opening?calculateOpeningLoanBilling({originalPrincipalMinor:config.principalMinor,disbursementDate:config.disbursementDate,openingDate:opening.openingDate,openingPrincipalMinor:opening.principalMinor,openingInterestDueMinor:opening.interestDueMinor,openingRecognizedInterestMinor:opening.recognizedInterestMinor,minimumAssessed:!!opening.minimumAssessed,asOfDate:asOf,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,cutoffRateBasisPoints:opening.cutoffRateBasisPoints??config.rateBasisPoints,cutoffPeriodDays:opening.cutoffPeriodDays??config.periodDays,repayments,rateChanges}):calculateLoanBilling({principalMinor:config.principalMinor,disbursementDate:config.disbursementDate,asOfDate:asOf,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,repayments,rateChanges});if(!repaymentsMatchLedger(payments,events,result.lines,validJournals))throw new Error('Posted allocation differs from current billing');const acc=totals.get(loan.currency)??{principal:0n,interest:0n};acc.principal+=BigInt(result.principalMinor);acc.interest+=BigInt(result.interestDueMinor);totals.set(loan.currency,acc);included++}catch{omitted.unavailable++}
 }
 const after=await listLoanBilling(db,actorId),afterJournals=await validRepaymentJournals(db,actorId,asOf);if(fingerprint(data,asOf)!==fingerprint(after,asOf)||JSON.stringify(journalIds)!==JSON.stringify(afterJournals))throw new Error('Lending data changed during capture; preview again')
 return {asOf,eligible:loans.length,included,omitted,totals:[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([currency,v])=>({currency,principalMinor:String(v.principal),interestMinor:String(v.interest)}))}
}
