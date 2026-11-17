import { kampalaBusinessDate } from '../../lib/kampala-business-date.ts'
import type { ComparableValuation } from './comparison.ts'

/** User-selected observations screen a provisional decline, without inferring equity classification. */
export function equityDipReview<T extends ComparableValuation>(baseline:T|undefined,current:T|undefined,today:string=kampalaBusinessDate()){
 if(!baseline||!current||baseline.id===current.id||baseline.investmentId!==current.investmentId||baseline.currency!==current.currency||baseline.valuationDate>=current.valuationDate||current.valuationDate<'2025-09-28'||current.valuationDate>today||!Number.isSafeInteger(baseline.amountMinor)||baseline.amountMinor<=0||!Number.isSafeInteger(current.amountMinor)||current.amountMinor<0)return null
 const start=BigInt(baseline.amountMinor),end=BigInt(current.amountMinor),decline=start>end?start-end:0n
 return {baseline,current,declineMinor:String(decline),basisPoints:String((decline*10000n+start/2n)/start),reviewRequired:decline*100n>=start*20n}
}
