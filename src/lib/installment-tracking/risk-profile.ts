import type { InstallmentRisk } from './calculation.ts'

export type RiskBalance = {loanId:string;currency:string;risk:InstallmentRisk;principalMinor:string;interestMinor:string}
const risks:InstallmentRisk[]=['smooth','mild','risky','very-risky','review','unknown']
function amount(value:string){if(typeof value!=='string'||!/^(0|[1-9]\d{0,29})$/.test(value))throw new Error('Invalid balance amount');return BigInt(value)}

/** Selected balances only: incomplete sources must be reported separately by the caller. */
export function summarizeCreditRisk(currency:string,balances:RiskBalance[]){
 if(!/^[A-Z]{3}$/.test(currency)||!Array.isArray(balances))throw new Error('Invalid currency or balances')
 const seen=new Set<string>(),totals=new Map(risks.map(risk=>[risk,{risk,loanCount:0,amount:0n}]))
 let total=0n
 for(const row of balances){
  if(!row||typeof row.loanId!=='string'||!row.loanId.trim()||seen.has(row.loanId))throw new Error('Invalid or duplicate loan')
  if(row.currency!==currency)throw new Error('Balance currency mismatch')
  const band=totals.get(row.risk);if(!band)throw new Error('Invalid risk')
  seen.add(row.loanId);const value=amount(row.principalMinor)+amount(row.interestMinor);band.loanCount++;band.amount+=value;total+=value
 }
 return {currency,totalMinor:String(total),unclassifiedMinor:String(totals.get('unknown')!.amount+totals.get('review')!.amount),bands:[...totals.values()].map(b=>({risk:b.risk,loanCount:b.loanCount,amountMinor:String(b.amount),basisPoints:total===0n?null:String((b.amount*10000n+total/2n)/total)}))}
}
