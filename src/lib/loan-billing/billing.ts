import {parseRateChanges,rateNumerator,RATE_DENOMINATOR,type BillingRateChange} from './rates.ts'
export type BillingRepayment = { id: string; date: string; amountMinor: string }
export type LoanBillingInput = { principalMinor: string; disbursementDate: string; asOfDate: string; rateBasisPoints: number; periodDays: 30 | 60 | 180; repayments: BillingRepayment[]; rateChanges?:BillingRateChange[] }
export type BillingLine = { type: 'billing' | 'accrual' | 'minimum' | 'payment'; date: string; interestMinor: string; principalMinor?: string; unappliedMinor?: string; paymentId?: string }
export type LoanBillingResult = { lines: BillingLine[]; principalMinor: string; interestDueMinor: string; interestPaidMinor: string; totalInterestMinor: string; minimumInterestMinor: string; settlementInterestMinor: string; settlementTotalMinor: string; unappliedMinor: string }

const DAY=86_400_000
function parseDay(s:string):number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Enter valid dates in YYYY-MM-DD format')
  const d=new Date(`${s}T00:00:00.000Z`)
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==s) throw new Error('Enter a valid calendar date')
  return d.getTime()/DAY
}
function iso(day:number):string {return new Date(day*DAY).toISOString().slice(0,10)}
function amount(s:string,label:string):bigint {
  if(typeof s!=='string'||!/^\d{1,30}$/.test(s)) throw new Error(`Enter a valid ${label} in minor units`)
  return BigInt(s)
}
function month27(year:number,month:number):number {return Date.UTC(year,month,27)/DAY}

/** Provisional billing and repayment allocation; does not persist or post journals. */
export function calculateLoanBilling(input:LoanBillingInput):LoanBillingResult {
 const start=parseDay(input.disbursementDate),end=parseDay(input.asOfDate),original=amount(input.principalMinor,'principal')
 if(end<start)throw new Error('As-of date cannot precede disbursement')
 if(end-start>36600)throw new Error('Calculation period cannot exceed 100 years')
 if(original<=0n)throw new Error('Principal must be positive')
 if(!Number.isInteger(input.rateBasisPoints)||input.rateBasisPoints<0||input.rateBasisPoints>10000||![30,60,180].includes(input.periodDays))throw new Error('Invalid rate or period')
 if(!Array.isArray(input.repayments)||input.repayments.length>1000)throw new Error('Invalid repayment list')
 const ids=new Set<string>()
 const repayments=input.repayments.map(p=>{if(typeof p.id!=='string'||!p.id.trim()||p.id.length>128||ids.has(p.id))throw new Error('Repayment IDs must be unique');ids.add(p.id);const date=parseDay(p.date),value=amount(p.amountMinor,'repayment');if(date<start||date>end||value<=0n)throw new Error('Each repayment must be positive and within the calculation period');return {id:p.id,date,value}}).sort((a,b)=>a.date-b.date||(a.id<b.id?-1:a.id>b.id?1:0))
 const denominator=10000n*BigInt(input.periodDays),rate=BigInt(input.rateBasisPoints)
 const minimum=(original*rate*60n+denominator/2n)/denominator
 const changes=parseRateChanges(input.rateChanges,start),changesByDate=new Map(changes.map(c=>[c.date,c.numerator]))
 const startDate=new Date(start*DAY),monthStep=input.periodDays===180?6:input.periodDays===60?2:1
 let y=startDate.getUTCFullYear(),m=startDate.getUTCMonth(),bill=month27(y,m)
 if(bill<start){m++;bill=month27(y,m)}else if(bill===start){m+=monthStep;bill=month27(y,m)}
 const bills=new Set<number>()
 while(bill<=end){bills.add(bill);m+=monthStep;bill=month27(y,m)}
 const minimumDay=start+60, dates=new Set<number>([end,...bills,...repayments.map(p=>p.date),...changes.filter(c=>c.date<=end).map(c=>c.date)])
 if(minimumDay<=end)dates.add(minimumDay)
 const ordered=[...dates].sort((a,b)=>a-b),lines:BillingLine[]=[]
 let principal=original,interestDue=0n,interestPaid=0n,totalInterest=0n,unapplied=0n,cursor=start,weighted=0n,accrualRecognized=0n,minimumApplied=false,currentRate=rateNumerator(input.rateBasisPoints,input.periodDays)
 function recognize(day:number) {
   weighted+=principal*BigInt(day-cursor)*currentRate;cursor=day
   const cumulative=(weighted+RATE_DENOMINATOR/2n)/RATE_DENOMINATOR,delta=cumulative-accrualRecognized
   accrualRecognized=cumulative;interestDue+=delta;totalInterest+=delta
   return delta
 }
 function enforceMinimum(day:number) {
   if(minimumApplied)return
   minimumApplied=true
   const add=minimum>totalInterest?minimum-totalInterest:0n
   if(add){interestDue+=add;totalInterest+=add;lines.push({type:'minimum',date:iso(day),interestMinor:String(add)})}
 }
 for(const date of ordered){
   const earned=recognize(date)
   currentRate=changesByDate.get(date)??currentRate
   if(bills.has(date)&&principal>0n)lines.push({type:'billing',date:iso(date),interestMinor:String(earned)})
   else if(earned)lines.push({type:'accrual',date:iso(date),interestMinor:String(earned)})
   if(date===minimumDay && principal>0n)enforceMinimum(date)
   for(const payment of repayments.filter(p=>p.date===date)){
     if(principal>0n&&!minimumApplied&&payment.value>=principal+interestDue)enforceMinimum(date)
     const interest=payment.value<interestDue?payment.value:interestDue;interestDue-=interest;interestPaid+=interest
     let rest=payment.value-interest;const principalPart=rest<principal?rest:principal;principal-=principalPart;rest-=principalPart;unapplied+=rest
     lines.push({type:'payment',date:iso(date),paymentId:payment.id,interestMinor:String(interest),principalMinor:String(principalPart),unappliedMinor:String(rest)})
   }
 }
 const settlementTopUp=principal>0n&&!minimumApplied&&minimum>totalInterest?minimum-totalInterest:0n
 const settlementInterest=interestDue+settlementTopUp
 return {lines,principalMinor:String(principal),interestDueMinor:String(interestDue),interestPaidMinor:String(interestPaid),totalInterestMinor:String(totalInterest),minimumInterestMinor:String(minimum),settlementInterestMinor:String(settlementInterest),settlementTotalMinor:String(principal+settlementInterest),unappliedMinor:String(unapplied)}
}
