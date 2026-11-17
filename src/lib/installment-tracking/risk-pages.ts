import type { captureCreditRisk } from '../../server/credit-risk/capture.ts'
type Page=Awaited<ReturnType<typeof captureCreditRisk>>

/** Combine page amounts before calculating percentages; reject mismatched captures. */
export function mergeRiskPages(current:Page,page:Page):Page{
 if(current.currency!==page.currency||current.asOfDate!==page.asOfDate||current.fingerprint!==page.fingerprint||current.totalEligible!==page.totalEligible)throw new Error('Profile changed')
 if(current.nextOffset===null||page.offset!==current.nextOffset||current.eligibleCount+page.eligibleCount>current.totalEligible)throw new Error('Profile page out of order')
 const total=BigInt(current.totalMinor)+BigInt(page.totalMinor)
 const bands:Page['bands']=current.bands.map((band,index)=>{const other=page.bands[index];if(!other||other.risk!==band.risk)throw new Error('Profile changed');const value=BigInt(band.amountMinor)+BigInt(other.amountMinor);return {...band,loanCount:band.loanCount+other.loanCount,amountMinor:String(value),basisPoints:total===0n?null:String((value*10000n+total/2n)/total)}})
 return {...current,bands,totalMinor:String(total),unclassifiedMinor:String(BigInt(current.unclassifiedMinor)+BigInt(page.unclassifiedMinor)),eligibleCount:current.eligibleCount+page.eligibleCount,includedCount:current.includedCount+page.includedCount,unavailableLoanIds:[...current.unavailableLoanIds,...page.unavailableLoanIds],finishedAt:page.finishedAt,nextOffset:page.nextOffset}
}
