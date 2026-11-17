import type { BillingLine, BillingRepayment, LoanBillingResult } from './billing.ts'
import {parseRateChanges,rateNumerator,RATE_DENOMINATOR,type BillingRateChange} from './rates.ts'

export type OpeningLoanBillingInput = {
 originalPrincipalMinor:string; disbursementDate:string; openingDate:string; openingPrincipalMinor:string;
 openingInterestDueMinor:string; openingRecognizedInterestMinor:string; minimumAssessed:boolean;
 asOfDate:string; rateBasisPoints:number; periodDays:30|60|180; cutoffRateBasisPoints?:number; cutoffPeriodDays?:30|60|180; repayments:BillingRepayment[]; rateChanges?:BillingRateChange[]
}
const DAY=86400000
function day(s:string):number {if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('Invalid date');const d=new Date(`${s}T00:00:00.000Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error('Invalid date');return d.getTime()/DAY}
function money(s:string):bigint {if(typeof s!=='string'||!/^\d{1,30}$/.test(s))throw new Error('Invalid amount');return BigInt(s)}
function iso(d:number){return new Date(d*DAY).toISOString().slice(0,10)}

/** The opening snapshot contains all events through the opening date. No journals are created. */
export function calculateOpeningLoanBilling(input:OpeningLoanBillingInput):LoanBillingResult & {openingRecognizedInterestMinor:string;incrementalInterestMinor:string} {
 const original=money(input.originalPrincipalMinor), openingPrincipal=money(input.openingPrincipalMinor), openingDue=money(input.openingInterestDueMinor), baseline=money(input.openingRecognizedInterestMinor)
 const start=day(input.disbursementDate), cutoff=day(input.openingDate), end=day(input.asOfDate)
 if(original===0n||openingPrincipal>original||openingDue>baseline||cutoff<start||end<cutoff||end-start>36600)throw new Error('Invalid opening snapshot')
 if(typeof input.minimumAssessed!=='boolean'||!Number.isInteger(input.rateBasisPoints)||input.rateBasisPoints<0||input.rateBasisPoints>10000||![30,60,180].includes(input.periodDays))throw new Error('Invalid billing terms')
 const denominator=BigInt(input.periodDays)*10000n,rate=BigInt(input.rateBasisPoints),minimum=(original*rate*60n+denominator/2n)/denominator
 const changes=parseRateChanges(input.rateChanges,cutoff),changesByDate=new Map(changes.map(c=>[c.date,c.numerator]))
 if((cutoff>=start+60&&!input.minimumAssessed)||(input.minimumAssessed&&baseline<minimum)||(openingPrincipal===0n&&!input.minimumAssessed))throw new Error('Opening minimum status conflicts with the snapshot')
 if(!Array.isArray(input.repayments)||input.repayments.length>1000)throw new Error('Invalid repayments')
 const ids=new Set<string>();const payments=input.repayments.map(p=>{if(typeof p.id!=='string'||!p.id.trim()||p.id.length>128||ids.has(p.id))throw new Error('Invalid repayment ID');ids.add(p.id);const date=day(p.date),value=money(p.amountMinor);if(date<=cutoff||date>end||value===0n)throw new Error('Repayment must follow the opening date and be within the period');return{id:p.id,date,value}}).sort((a,b)=>a.date-b.date||(a.id<b.id?-1:a.id>b.id?1:0))
 const origin=new Date(start*DAY),step=input.periodDays===180?6:input.periodDays===60?2:1;let month=origin.getUTCMonth(),year=origin.getUTCFullYear(),bill=Date.UTC(year,month,27)/DAY
 if(bill<start){month++;bill=Date.UTC(year,month,27)/DAY}else if(bill===start){month+=step;bill=Date.UTC(year,month,27)/DAY}
 const bills=new Set<number>();while(bill<=end){if(bill>cutoff)bills.add(bill);month+=step;bill=Date.UTC(year,month,27)/DAY}
 const minimumDay=start+60,dates=new Set<number>([end,...bills,...payments.map(p=>p.date),...changes.filter(c=>c.date<=end).map(c=>c.date)]);if(minimumDay>cutoff&&minimumDay<=end)dates.add(minimumDay)
 if((input.cutoffRateBasisPoints===undefined)!==(input.cutoffPeriodDays===undefined))throw new Error('Incomplete opening cutoff rate')
 let principal=openingPrincipal,due=openingDue,total=baseline,paid=0n,unapplied=0n,cursor=cutoff,weighted=0n,recognized=0n,minimumApplied=input.minimumAssessed,currentRate=rateNumerator(input.cutoffRateBasisPoints??input.rateBasisPoints,input.cutoffPeriodDays??input.periodDays);const lines:BillingLine[]=[]
 function enforce(date:number){if(minimumApplied)return;minimumApplied=true;const add=minimum>total?minimum-total:0n;if(add){due+=add;total+=add;lines.push({type:'minimum',date:iso(date),interestMinor:String(add)})}}
 for(const date of [...dates].sort((a,b)=>a-b)){
  weighted+=principal*BigInt(date-cursor)*currentRate;cursor=date;const cumulative=(weighted+RATE_DENOMINATOR/2n)/RATE_DENOMINATOR,earned=cumulative-recognized;recognized=cumulative;due+=earned;total+=earned;currentRate=changesByDate.get(date)??currentRate
  if(bills.has(date)&&principal>0n)lines.push({type:'billing',date:iso(date),interestMinor:String(earned)});else if(earned)lines.push({type:'accrual',date:iso(date),interestMinor:String(earned)})
  if(date===minimumDay&&principal>0n)enforce(date)
  for(const p of payments.filter(p=>p.date===date)){if(principal>0n&&!minimumApplied&&p.value>=principal+due)enforce(date);const interest=p.value<due?p.value:due;due-=interest;paid+=interest;let rest=p.value-interest;const part=rest<principal?rest:principal;principal-=part;rest-=part;unapplied+=rest;lines.push({type:'payment',date:iso(date),paymentId:p.id,interestMinor:String(interest),principalMinor:String(part),unappliedMinor:String(rest)})}
 }
 const topup=principal>0n&&!minimumApplied&&minimum>total?minimum-total:0n,settlement=due+topup
 return {lines,principalMinor:String(principal),interestDueMinor:String(due),interestPaidMinor:String(paid),totalInterestMinor:String(total),minimumInterestMinor:String(minimum),settlementInterestMinor:String(settlement),settlementTotalMinor:String(principal+settlement),unappliedMinor:String(unapplied),openingRecognizedInterestMinor:String(baseline),incrementalInterestMinor:String(total-baseline)}
}
