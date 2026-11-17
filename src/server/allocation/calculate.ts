export type Investment={id:string;name:string;assetClass:string;currency:string;status:string}
export type Valuation={id:string;investmentId:string;valuationDate:string;amountMinor:string;currency:string;basis:string;source:string|null}
export type Policy={id:string;assetClass:string;effectiveDate:string;minBasisPoints:number|null;maxBasisPoints:number|null;targetBasisPoints:number|null;source:string|null}
export type Dataset={snapshotAt:string;investments:Investment[];valuations:Valuation[];policies:Policy[]}
export function calculateAllocation(data:Dataset,currency:string,asOf:string,selected:Record<string,string>,mappings:Record<string,string>,zeroPolicyIds:string[]=[]){
 if(!/^[A-Z]{3}$/.test(currency)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)throw new Error('Choose a currency and valid date')
 const chosen=Object.entries(selected).filter(([,v])=>v)
 const rows=chosen.map(([id,vid])=>{const investment=data.investments.find(i=>i.id===id),valuation=data.valuations.find(v=>v.id===vid);if(!investment||!valuation||valuation.investmentId!==id||investment.currency!==currency||valuation.currency!==currency||valuation.valuationDate>asOf||!/^\d+$/.test(valuation.amountMinor))throw new Error('Invalid valuation selection');return {...valuation,name:investment.name,assetClass:investment.assetClass}})
 const total=rows.reduce((sum,r)=>sum+BigInt(r.amountMinor),0n);if(total===0n)throw new Error('Select values with a positive total')
 const amounts=new Map<string,bigint>();for(const r of rows)amounts.set(r.assetClass,(amounts.get(r.assetClass)??0n)+BigInt(r.amountMinor))
 const groups=new Map<string,{policy:Policy;amount:bigint;assetClasses:string[]}>()
 const mappingFor=(assetClass:string)=>Object.hasOwn(mappings,assetClass)?mappings[assetClass]:undefined
 for(const [assetClass,amount] of amounts){const policyId=mappingFor(assetClass);if(!policyId)continue;const policy=data.policies.find(p=>p.id===policyId);if(!policy||policy.effectiveDate>asOf)throw new Error('Invalid policy selection');const group=groups.get(policyId);if(group){group.amount+=amount;group.assetClasses.push(assetClass)}else groups.set(policyId,{policy,amount,assetClasses:[assetClass]})}
 if(!Array.isArray(zeroPolicyIds)||new Set(zeroPolicyIds).size!==zeroPolicyIds.length)throw new Error('Duplicate zero policy selection')
 for(const id of zeroPolicyIds){if(groups.has(id))throw new Error('Policy already mapped to selected classes');const policy=data.policies.find(p=>p.id===id);if(!policy||policy.effectiveDate>asOf)throw new Error('Invalid policy selection');groups.set(id,{policy,amount:0n,assetClasses:[]})}
 const compare=(amount:bigint,policy:Policy)=>{if(policy.minBasisPoints===null||policy.maxBasisPoints===null)return 'not compared';const scaled=amount*10000n;return scaled<BigInt(policy.minBasisPoints)*total?'below':scaled>BigInt(policy.maxBasisPoints)*total?'above':'within'}
 const policyGroups=[...groups.values()].map(g=>({policy:g.policy,assetClasses:g.assetClasses,amountMinor:String(g.amount),basisPoints:String((g.amount*10000n+total/2n)/total),comparison:compare(g.amount,g.policy),explicitZero:g.assetClasses.length===0}))
 const classes=[...amounts].map(([assetClass,amount])=>{const group=groups.get(mappingFor(assetClass)??'');return {assetClass,amountMinor:String(amount),basisPoints:String((amount*10000n+total/2n)/total),policy:group?.policy,comparison:group?(group.assetClasses.length>1?'grouped':compare(amount,group.policy)):'not compared'}})
 return {currency,asOf,snapshotAt:data.snapshotAt,total:String(total),selected:rows,excluded:data.investments.filter(i=>!chosen.some(([id])=>id===i.id)),classes,policyGroups}
}
