import {calculateLoanBilling, type LoanBillingInput, type LoanBillingResult} from './billing.ts'
import {calculateOpeningLoanBilling, type OpeningLoanBillingInput} from './opening.ts'

type Plan = {asOfDate:string; firstDueDate:string; cadenceMonths:1|2|6; installments:number; principalStyle:'end'|'equal'}
export type ProjectionInput = (Omit<LoanBillingInput,'asOfDate'> & {kind:'original'} | Omit<OpeningLoanBillingInput,'asOfDate'> & {kind:'opening'}) & Plan
export type ProjectionRow = {date:string;interestMinor:string;principalMinor:string;paymentMinor:string;remainingPrincipalMinor:string;remainingInterestMinor:string}

function validDate(value:string) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid date')
 const date=new Date(`${value}T00:00:00.000Z`)
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) throw new Error('Enter a valid calendar date')
 return date
}
function installmentDate(first:Date,offset:number) {
 const year=first.getUTCFullYear(),month=first.getUTCMonth()+offset,anchor=first.getUTCDate()
 const last=new Date(0);last.setUTCHours(0,0,0,0);last.setUTCFullYear(year,month+1,0)
 const target=new Date(0);target.setUTCHours(0,0,0,0);target.setUTCFullYear(year,month,Math.min(anchor,last.getUTCDate()))
 const value=target.toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Forecast date out of range');return value
}

/** Hypothetical repayments are passed to the existing calculator; nothing is posted or persisted. */
export function projectRepaymentSchedule(input:ProjectionInput) {
 validDate(input.asOfDate);const first=validDate(input.firstDueDate)
 if(input.firstDueDate<=input.asOfDate)throw new Error('First installment must be after the review date')
 if(!Number.isInteger(input.installments)||input.installments<1||input.installments>120)throw new Error('Choose 1 to 120 installments')
 if(![1,2,6].includes(input.cadenceMonths)||!['end','equal'].includes(input.principalStyle))throw new Error('Invalid forecast assumptions')
 if(!Array.isArray(input.repayments)||input.repayments.length+input.installments>1000)throw new Error('Too many repayments to forecast')
 const payments=[...input.repayments]
 if(payments.some(p=>p.date>input.asOfDate))throw new Error('Recorded repayments after the review date must be reviewed first')
 const calculate=(asOfDate:string):LoanBillingResult=>input.kind==='opening'
  ? calculateOpeningLoanBilling({...input,asOfDate,repayments:payments})
  : calculateLoanBilling({...input,asOfDate,repayments:payments})
 const initial=calculate(input.asOfDate),principal=BigInt(initial.principalMinor),count=BigInt(input.installments)
 const each=principal/count,remainder=principal%count,ids=new Set(payments.map(p=>p.id)),rows:ProjectionRow[]=[]
 let totalInterest=0n,totalPrincipal=0n
 for(let i=0;i<input.installments;i++){
  const date=installmentDate(first,i*input.cadenceMonths),before=calculate(date),remaining=BigInt(before.principalMinor)
  const principalPart=input.principalStyle==='end' ? (i===input.installments-1?remaining:0n) : (each+(BigInt(i)<remainder?1n:0n))
  const settling=remaining>0n&&principalPart===remaining
  const interest=BigInt(settling?before.settlementInterestMinor:before.interestDueMinor),payment=principalPart+interest
  if(payment>0n){let id=`projected-${i}`;while(ids.has(id))id=`_${id}`;ids.add(id);payments.push({id,date,amountMinor:String(payment)})}
  const after=calculate(date)
  rows.push({date,interestMinor:String(interest),principalMinor:String(principalPart),paymentMinor:String(payment),remainingPrincipalMinor:after.principalMinor,remainingInterestMinor:after.interestDueMinor})
  totalInterest+=interest;totalPrincipal+=principalPart
 }
 return {startingPrincipalMinor:initial.principalMinor,startingInterestDueMinor:initial.interestDueMinor,rows,totalInterestMinor:String(totalInterest),totalPrincipalMinor:String(totalPrincipal),totalPaymentMinor:String(totalInterest+totalPrincipal)}
}
