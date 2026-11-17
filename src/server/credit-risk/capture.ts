import { summarizeCreditRisk, type RiskBalance } from '../../lib/installment-tracking/risk-profile.ts'
import type { InstallmentRisk } from '../../lib/installment-tracking/calculation.ts'

type Loan={id:string;currency:string;disbursementDate:string}
type Dependencies={
 readState:()=>Promise<{loans:Loan[];[key:string]:unknown}>
 readBalance:(loanId:string)=>Promise<{principalMinor:string;interestMinor:string}|null>
 readRisk:(loanId:string)=>Promise<InstallmentRisk|null>
 readPlanTokens:()=>Promise<string>
 clock:()=>Date
}
/** Capture the current recorded book; separate reads are not a database snapshot. */
export async function captureCreditRisk(currency:string,asOfDate:string,deps:Dependencies,page?:{offset:number;expectedFingerprint?:string}){
 if(!/^[A-Z]{3}$/.test(currency)||!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)||!Number.isFinite(Date.parse(`${asOfDate}T00:00:00Z`))||new Date(`${asOfDate}T00:00:00Z`).toISOString().slice(0,10)!==asOfDate)throw new Error('Invalid currency or date')
 if(page&&(!Number.isSafeInteger(page.offset)||page.offset<0||page.offset%5!==0||page.expectedFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(page.expectedFingerprint)))throw new Error('Invalid profile page')
 if(page&&page.offset>0&&!page.expectedFingerprint)throw new Error('Profile continuation requires the original fingerprint')
 const startedAt=deps.clock().toISOString(),before=await deps.readState(),allEligible=before.loans.filter(loan=>loan.currency===currency&&loan.disbursementDate<=asOfDate).sort((a,b)=>a.id.localeCompare(b.id))
 if(new Set(allEligible.map(loan=>loan.id)).size!==allEligible.length)throw new Error('Duplicate loan')
 const offset=page?.offset??0;if(page&&offset>allEligible.length)throw new Error('Invalid profile page')
 const eligible=page?allEligible.slice(offset,offset+5):allEligible
 const balances:RiskBalance[]=[],unavailableLoanIds:string[]=[],planTokens=await deps.readPlanTokens()
 const bytes=new TextEncoder().encode(JSON.stringify([currency,asOfDate,before,planTokens])),digest=await crypto.subtle.digest('SHA-256',bytes),fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
 if(page?.expectedFingerprint&&page.expectedFingerprint!==fingerprint)throw new Error('Loan records changed; calculate again')
 for(const loan of eligible){
  const balance=await deps.readBalance(loan.id)
  if(!balance){unavailableLoanIds.push(loan.id);continue}
  const risk=await deps.readRisk(loan.id)??'unknown'
  balances.push({loanId:loan.id,currency,risk,...balance})
 }
 const after=await deps.readState();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Loan records changed; calculate again')
 if(planTokens!==await deps.readPlanTokens())throw new Error('Installment schedule changed; calculate again')
 return {...summarizeCreditRisk(currency,balances),asOfDate,offset,eligibleCount:eligible.length,totalEligible:allEligible.length,nextOffset:page&&offset+eligible.length<allEligible.length?offset+eligible.length:null,fingerprint,includedCount:balances.length,unavailableLoanIds,startedAt,finishedAt:deps.clock().toISOString()}
}
