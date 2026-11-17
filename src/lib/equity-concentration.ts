export type EquityClassification={investmentId:string;company:string;sector:string}
export type EquityPosition=EquityClassification&{name:string;amountMinor:string}
/** Flag possible spelling variants without asserting that they identify the same entity. */
export function equitySimilarLabels(positions:EquityPosition[]){
 const variants=(kind:'company'|'sector')=>{
  const grouped=new Map<string,Set<string>>()
  for(const position of positions){const label=position[kind],key=label.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();const names=grouped.get(key)??new Set<string>();names.add(label);grouped.set(key,names)}
  return [...grouped.values()].filter(names=>names.size>1).map(names=>[...names].sort()).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)
 }
 return {companies:variants('company'),sectors:variants('sector')}
}
export function equityConflictingCompanies(positions:EquityPosition[]){
 const sectors=new Map<string,Set<string>>()
 for(const p of positions){const values=sectors.get(p.company)??new Set<string>();values.add(p.sector);sectors.set(p.company,values)}
 return [...sectors].filter(([,values])=>values.size>1).map(([name])=>name).sort((a,b)=>a.localeCompare(b))
}
/** An explicitly classified subset, not a determination about the complete equity book. */
export function equityConcentration(positions:EquityPosition[]){
 const total=positions.reduce((n,p)=>n+BigInt(p.amountMinor),0n)
 const groups=(kind:'company'|'sector',limit:number)=>{
  const values=new Map<string,bigint>()
  for(const p of positions)values.set(p[kind],(values.get(p[kind])??0n)+BigInt(p.amountMinor))
  return [...values].sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,amountMinor:String(value),basisPoints:total===0n?null:String((value*10000n+total/2n)/total),comparison:total===0n?null:value*100n>total*BigInt(limit)?'above' as const:'within' as const}))
 }
 return {positions,inconsistentCompanies:equityConflictingCompanies(positions),totalMinor:String(total),companies:groups('company',25),sectors:groups('sector',40)}
}
