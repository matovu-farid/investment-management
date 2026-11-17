type Profile={asOfDate:string;offset:number;nextOffset:number|null;totalEligible:number;eligibleCount:number;includedCount:number;unavailableLoanIds:string[];totalMinor:string;unclassifiedMinor:string;bands:{risk:string;amountMinor:string}[]}
/** Indicative amount-based policy screen; it never makes or enforces a credit decision. */
export function creditEarlyWarning(profile:Profile):'not-applicable'|'unavailable'|'review'|'below'{
 if(profile.asOfDate<'2025-09-28')return 'not-applicable'
 const band=profile.bands.find(b=>b.risk==='very-risky')
 if(profile.offset!==0||profile.nextOffset!==null||profile.eligibleCount!==profile.totalEligible||profile.includedCount!==profile.eligibleCount||profile.unavailableLoanIds.length||!band||!/^(0|[1-9]\d*)$/.test(profile.totalMinor)||!/^(0|[1-9]\d*)$/.test(profile.unclassifiedMinor)||!/^(0|[1-9]\d*)$/.test(band.amountMinor))return 'unavailable'
 const total=BigInt(profile.totalMinor),unclassified=BigInt(profile.unclassifiedMinor),risky=BigInt(band.amountMinor)
 if(total===0n||unclassified!==0n||risky>total)return 'unavailable'
 return risky*10n>=total?'review':'below'
}
export const creditEarlyWarningLabel={
 'not-applicable':'The selected date precedes the 28 September 2025 policy; no comparison is shown.',
 unavailable:'Comparison unavailable: the profile is incomplete, has unclassified exposure, or has no positive included balance.',
 review:'At least 10% of the included amount is provisionally very risky; review the credit-tightening trigger.',
 below:'Less than 10% of the included amount is provisionally very risky.',
} as const
