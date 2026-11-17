/** Aggregate explicitly marked deals using the captured selected total. */
export function turboSummary(deals:{amountMinor:string}[],totalMinor:string){
 const total=BigInt(totalMinor),amount=deals.reduce((n,d)=>n+BigInt(d.amountMinor),0n)
 if(total<=0n||amount<0n||amount>total)throw new Error('Invalid Turbo review total')
 return {totalMinor:String(amount),totalBasisPoints:String((amount*10000n+total/2n)/total),totalComparison:amount*5n>total?'above' as const:'within' as const}
}
