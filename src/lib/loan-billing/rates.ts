export type BillingRateChange = { effectiveDate:string; rateBasisPoints:number; periodDays:30|60|180 }
const DAY=86_400_000
export const RATE_DENOMINATOR=1_800_000n
export function rateNumerator(rate:number,period:number):bigint {
 if(!Number.isInteger(rate)||rate<0||rate>10000||![30,60,180].includes(period))throw new Error('Invalid rate or period')
 return BigInt(rate)*BigInt(180/period)
}
export function parseRateChanges(changes:BillingRateChange[]|undefined,after:number):{date:number;numerator:bigint}[] {
 if(changes===undefined)return []
 if(!Array.isArray(changes)||changes.length>1000)throw new Error('Invalid rate changes')
 const days=new Set<number>()
 return changes.map(change=>{
  if(!change||typeof change.effectiveDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(change.effectiveDate))throw new Error('Invalid rate effective date')
  const d=new Date(`${change.effectiveDate}T00:00:00.000Z`)
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==change.effectiveDate)throw new Error('Invalid rate effective date')
  const date=d.getTime()/DAY
  if(date<=after||days.has(date))throw new Error('Rate changes must have distinct dates after the billing baseline')
  days.add(date)
  return {date,numerator:rateNumerator(change.rateBasisPoints,change.periodDays)}
 }).sort((a,b)=>a.date-b.date)
}
