export type Investment={id:string;name:string;assetClass:string;currency:string;status:string}
export type Valuation={id:string;investmentId:string;valuationDate:string;amountMinor:string;currency:string;basis:string;source:string|null}
export type Policy={id:string;assetClass:string;effectiveDate:string;minBasisPoints:number|null;maxBasisPoints:number|null;targetBasisPoints:number|null;source:string|null}
export type Dataset={snapshotAt:string;investments:Investment[];valuations:Valuation[];policies:Policy[]}
export function calculateAllocation(data:Dataset,currency:string,asOf:string,selected:Record<string,string>,mappings:Record<string,string>){
 if(!/^[A-Z]{3}$/.test(currency)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)throw new Error('Choose a currency and valid date')
 const chosen=Object.entries(selected).filter(([,v])=>v)
 const rows=chosen.map(([id,vid])=>{const investment=data.investments.find(i=>i.id===id),valuation=data.valuations.find(v=>v.id===vid);if(!investment||!valuation||valuation.investmentId!==id||investment.currency!==currency||valuation.currency!==currency||valuation.valuationDate>asOf||!/^\d+$/.test(valuation.amountMinor))throw new Error('Invalid valuation selection');return {...valuation,name:investment.name,assetClass:investment.assetClass}})
 const total=rows.reduce((sum,r)=>sum+BigInt(r.amountMinor),0n);if(total===0n)throw new Error('Select values with a positive total')
 const amounts=new Map<string,bigint>();for(const r of rows)amounts.set(r.assetClass,(amounts.get(r.assetClass)??0n)+BigInt(r.amountMinor))
 const policyIds=new Set<string>();const classes=[...amounts].map(([assetClass,amount])=>{const policyId=mappings[assetClass];const policy=policyId?data.policies.find(p=>p.id===policyId):undefined;if(policyId&&(!policy||policy.effectiveDate>asOf||policyIds.has(policyId)))throw new Error('Invalid policy selection');if(policyId)policyIds.add(policyId);let comparison='not compared';if(policy&&policy.minBasisPoints!==null&&policy.maxBasisPoints!==null){const scaled=amount*10000n;comparison=scaled<BigInt(policy.minBasisPoints)*total?'below':scaled>BigInt(policy.maxBasisPoints)*total?'above':'within'}const basisPoints=(amount*10000n+total/2n)/total;return {assetClass,amountMinor:String(amount),basisPoints:String(basisPoints),policy,comparison}})
 return {currency,asOf,snapshotAt:data.snapshotAt,total:String(total),selected:rows,excluded:data.investments.filter(i=>!chosen.some(([id])=>id===i.id)),classes}
}
