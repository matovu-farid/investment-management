/** A selected-source screen under the current IPS, not a compliance decision. */
export function screenInvestmentConcentration(input:{asOf:string;total:string;selected:{investmentId:string;name:string;amountMinor:string}[]}){
 if(input.asOf<'2025-09-28')return null
 if(!/^[1-9]\d*$/.test(input.total))throw new Error('Invalid selected total')
 const total=BigInt(input.total)
 return input.selected.map(investment=>{
  if(!/^(0|[1-9]\d*)$/.test(investment.amountMinor))throw new Error('Invalid investment amount')
  const value=BigInt(investment.amountMinor)
  return {...investment,basisPoints:String((value*10000n+total/2n)/total),comparison:value*100n>total*45n?'above' as const:'within' as const}
 })
}
