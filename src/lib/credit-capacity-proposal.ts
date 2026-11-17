/** Illustrative only: the proposed credit has not been approved, reserved or recorded. */
export function compareProposedCredit(input:{limitMinor:string;exposureMinor:string;proposalMinor:string;coverageComplete?:boolean}){
 if(input.coverageComplete===false)throw new Error('Complete loan coverage is required')
 if(!/^(0|[1-9]\d*)$/.test(input.limitMinor)||!/^(0|[1-9]\d*)$/.test(input.exposureMinor))throw new Error('Invalid reviewed amounts')
 if(!/^[1-9]\d{0,15}$/.test(input.proposalMinor)||BigInt(input.proposalMinor)>9007199254740991n)throw new Error('Enter a positive whole amount within the loan entry limit')
 const limit=BigInt(input.limitMinor),projected=BigInt(input.exposureMinor)+BigInt(input.proposalMinor),difference=limit-projected
 return {projectedExposureMinor:String(projected),remainingMinor:String(difference>0n?difference:0n),excessMinor:String(difference<0n?-difference:0n)}
}

/** Opt-in illustration: the administrator must verify independent-director status. */
export function compareDirectorCredit(input:{currency:string;asOf:string;exposureMinor:string;proposalMinor?:string;coverageComplete?:boolean}){
 if(input.currency!=='UGX')throw new Error('The director limit is stated in UGX')
 const date=new Date(`${input.asOf}T00:00:00Z`)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.asOf||input.asOf<'2025-09-28')throw new Error('The current director limit requires a valid date on or after 28 September 2025')
 if(input.coverageComplete===false)throw new Error('Complete loan coverage is required')
 if(!/^(0|[1-9]\d*)$/.test(input.exposureMinor))throw new Error('Invalid reviewed amounts')
 const limitMinor='5000000'
 if(input.proposalMinor!==undefined)return {limitMinor,...compareProposedCredit({limitMinor,exposureMinor:input.exposureMinor,proposalMinor:input.proposalMinor})}
 const exposure=BigInt(input.exposureMinor),limit=BigInt(limitMinor)
 return {limitMinor,projectedExposureMinor:String(exposure),remainingMinor:String(exposure<limit?limit-exposure:0n),excessMinor:String(exposure>limit?exposure-limit:0n)}
}
