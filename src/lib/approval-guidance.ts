/** IPS reference only; never grants or records an approval. UGX is zero-decimal. */
export function approvalGuidance(currency:string,amount:string,date:string,kind:'loan'|'investment'){
 if(currency!=='UGX'||date<'2025-09-28'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||!/^\d{1,16}$/.test(amount)||!Number.isSafeInteger(Number(amount))||Number(amount)<=0)return null
 const value=BigInt(amount)
 return {authority:value<=50000000n?'gm' as const:'gm-and-board' as const,externalReview:kind==='investment'&&value>300000000n}
}
