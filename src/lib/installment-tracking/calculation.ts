export type InstallmentRow={dueDate:string;principalMinor:string;interestMinor:string}
export type InstallmentPayment={id:string;date:string;principalMinor:string;interestMinor:string;unappliedMinor:string;journalId?:string}
export type InstallmentRisk='smooth'|'mild'|'risky'|'very-risky'|'review'|'unknown'
export type TrackingInput={rows:InstallmentRow[];asOfDate:string;coverageStart:string;historyComplete:boolean;payments:InstallmentPayment[];pendingReceipts:number;stale?:boolean;lastPaymentBeforeCoverage?:string|null;noPaymentAnchor?:string}
const oneDay=86400000
function date(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(`${s}T00:00:00Z`))||new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)!==s)throw new Error('Invalid date');return s}
function amount(s:string){if(typeof s!=='string'||!/^(0|[1-9]\d*)$/.test(s)||s.length>30)throw new Error('Invalid amount');return BigInt(s)}
function sixMonths(s:string){const d=new Date(`${s}T00:00:00Z`),y=d.getUTCFullYear(),m=d.getUTCMonth()+6,day=d.getUTCDate();const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return new Date(Date.UTC(y,m,Math.min(day,last))).toISOString().slice(0,10)}
/** Derives status solely from the passed reviewed plan and actual posted payment allocations. */
export function calculateInstallmentTracking(input:TrackingInput){
 const asOfDate=date(input.asOfDate),coverageStart=date(input.coverageStart)
 if(asOfDate<coverageStart)throw new Error('Tracking date must be on or after the schedule coverage start')
 if(!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>120||!Array.isArray(input.payments)||!Number.isSafeInteger(input.pendingReceipts)||input.pendingReceipts<0||typeof input.historyComplete!=='boolean')throw new Error('Invalid tracking input')
 let previous='', rows=input.rows.map(r=>{const dueDate=date(r.dueDate),principal=amount(r.principalMinor),interest=amount(r.interestMinor);if(dueDate<=previous||principal+interest===0n)throw new Error('Invalid installment order or amount');previous=dueDate;return {...r,principal,interest,principalPaid:0n,interestPaid:0n,allocations:[] as {repaymentId:string;date:string;journalId:string|null;principalMinor:string;interestMinor:string}[]}})
 const noPaymentAnchor=date(input.noPaymentAnchor??coverageStart),priorPayment=input.lastPaymentBeforeCoverage==null?null:date(input.lastPaymentBeforeCoverage);if(noPaymentAnchor>coverageStart||priorPayment&&priorPayment>coverageStart)throw new Error('Invalid payment history baseline')
 let unmatchedPrincipal=0n,unmatchedInterest=0n,unapplied=0n,lastPaymentDate:string|null=priorPayment
 const ids=new Set<string>(),payments=input.payments.filter(p=>date(p.date)<=asOfDate&&p.date>=coverageStart).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 for(const p of payments){if(typeof p.id!=='string'||!p.id||ids.has(p.id))throw new Error('Invalid or duplicate repayment');ids.add(p.id);let principal=amount(p.principalMinor),interest=amount(p.interestMinor);const excess=amount(p.unappliedMinor);unapplied+=excess;if(principal+interest>0n)lastPaymentDate=p.date
  for(const r of rows){const a=principal<r.principal-r.principalPaid?principal:r.principal-r.principalPaid;r.principalPaid+=a;principal-=a;const b=interest<r.interest-r.interestPaid?interest:r.interest-r.interestPaid;r.interestPaid+=b;interest-=b;if(a||b)r.allocations.push({repaymentId:p.id,date:p.date,journalId:p.journalId??null,principalMinor:String(a),interestMinor:String(b)})}unmatchedPrincipal+=principal;unmatchedInterest+=interest
 }
 const unpaid=rows.find(r=>r.dueDate<asOfDate&&(r.principal>r.principalPaid||r.interest>r.interestPaid));const days=unpaid?Math.round((Date.parse(`${asOfDate}T00:00:00Z`)-Date.parse(`${unpaid.dueDate}T00:00:00Z`))/oneDay):0
 const coverageComplete=input.historyComplete&&input.pendingReceipts===0&&!input.stale&&coverageStart<=asOfDate
 const outstanding=rows.some(r=>r.principal>r.principalPaid||r.interest>r.interestPaid)
 const noPaymentSixMonths=coverageComplete?outstanding&&asOfDate>sixMonths(lastPaymentDate??noPaymentAnchor):null
 let risk:InstallmentRisk='unknown';if(coverageComplete)risk=noPaymentSixMonths?'very-risky':days===0?'smooth':days<=90?'mild':days<=180?'risky':'review'
 return {asOfDate,rows:rows.map(r=>({dueDate:r.dueDate,principalMinor:r.principalMinor,interestMinor:r.interestMinor,principalPaidMinor:String(r.principalPaid),interestPaidMinor:String(r.interestPaid),principalRemainingMinor:String(r.principal-r.principalPaid),interestRemainingMinor:String(r.interest-r.interestPaid),allocations:r.allocations})),payments,pendingReceipts:input.pendingReceipts,unmatchedPrincipalMinor:String(unmatchedPrincipal),unmatchedInterestMinor:String(unmatchedInterest),unappliedMinor:String(unapplied),oldestUnpaidDueDate:unpaid?.dueDate??null,daysOverdue:days,risk,noPaymentSixMonths,lastPaymentDate,coverageComplete}
}
