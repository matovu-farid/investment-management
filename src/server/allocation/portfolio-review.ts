import { equityConcentration, type EquityClassification } from '../../lib/equity-concentration.ts'
import { turboSummary } from '../../lib/turbo-summary.ts'
import { getAllocationData } from './service.ts'
import { calculatePortfolioAllocation, type PortfolioBalance } from './portfolio.ts'
import { capturePortfolioSources } from './portfolio-sources.ts'

type Selection = { asOf:string; currency:string; cashAccountIds:string[]; includeLending:boolean; selected:Record<string,string>; mappings:Record<string,string>; zeroPolicyIds:string[]; overlapReviewed:boolean; liquidityReview?:{investmentIds:string[];cashAccountIds:string[]}; turboReview?:{investmentIds:string[];memoReferences?:Record<string,string>}; equityReview?:{classifications:EquityClassification[]} }
type Dependencies = { data:typeof getAllocationData; sources:typeof capturePortfolioSources }
const defaults:Dependencies = { data:getAllocationData, sources:capturePortfolioSources }

/** A selected-source working paper, not proof of complete or reconciled assets. */
export async function reviewPortfolioAllocation(db:D1Database, actorId:string|null, selection:Selection, deps:Dependencies=defaults) {
 if(!actorId) throw new Error('Unauthorized')
 if(!selection || selection.overlapReviewed!==true) throw new Error('Review overlap between selected sources before calculating')
 if(selection.liquidityReview!==undefined&&selection.asOf<'2025-09-28')throw new Error('Liquidity review requires a date on or after 28 September 2025')
 if(selection.turboReview!==undefined&&selection.asOf<'2025-09-28')throw new Error('Turbo review requires a date on or after 28 September 2025')
 if(selection.equityReview!==undefined&&selection.asOf<'2025-09-28')throw new Error('Equity review requires a date on or after 28 September 2025')
 const validMap=(value:unknown)=>!!value && typeof value==='object' && !Array.isArray(value) && Object.entries(value).length<=100 && Object.entries(value).every(([key,val])=>key.length>0 && key.length<=200 && key.trim()===key && typeof val==='string' && val.length>0 && val.length<=128 && val.trim()===val)
 if(!validMap(selection.selected) || !validMap(selection.mappings) || !Array.isArray(selection.zeroPolicyIds) || selection.zeroPolicyIds.length>100 || selection.zeroPolicyIds.some(id=>typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>128)) throw new Error('Invalid selections')
 if(new Set(selection.zeroPolicyIds).size!==selection.zeroPolicyIds.length)throw new Error('Duplicate zero policy selection')
 const before=await deps.data(db,actorId)
 const sources=await deps.sources(db,actorId,{asOf:selection.asOf,currency:selection.currency,cashAccountIds:selection.cashAccountIds,includeLending:selection.includeLending})
 const after=await deps.data(db,actorId)
 const fingerprint=(d:typeof before)=>JSON.stringify([d.investments,d.valuations,d.policies])
 if(fingerprint(before)!==fingerprint(after))throw new Error('Investment or policy data changed during capture; retry')
 const balances:PortfolioBalance[]=sources.cash.map(account=>({kind:'cash',id:account.accountId,name:`${account.code} — ${account.name}`,assetClass:'Cash',currency:selection.currency,asOf:selection.asOf,amountMinor:account.netDebit,source:'Posted ledger balance'}))
 if(sources.lending){const totals=sources.lending.totals.find(t=>t.currency===selection.currency);const amount=totals?BigInt(totals.principalMinor)+BigInt(totals.interestMinor):0n;balances.push({kind:'lending',id:'calculated-lending',name:'Provisional member credit',assetClass:'Member credit',currency:selection.currency,asOf:selection.asOf,amountMinor:String(amount),source:'Calculated principal and accrued unpaid interest; see coverage'})}
 const classes=new Set([...Object.keys(selection.selected).map(id=>after.investments.find(i=>i.id===id)?.assetClass),...balances.map(b=>b.assetClass)])
 if(Object.keys(selection.mappings).some(name=>!classes.has(name)))throw new Error('Policy mapping has no selected class')
 const allocation=calculatePortfolioAllocation(after,selection.currency,selection.asOf,selection.selected,selection.mappings,selection.zeroPolicyIds,balances)
 let liquidity:undefined|{investmentIds:string[];cashAccountIds:string[];amountMinor:string;basisPoints:string;comparison:'below'|'within'}
 if(selection.liquidityReview!==undefined){
  const review=selection.liquidityReview
  const validIds=(ids:unknown):ids is string[]=>Array.isArray(ids)&&ids.length<=500&&ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=128&&id===id.trim())&&new Set(ids).size===ids.length
  if(!review||typeof review!=='object'||!validIds(review.investmentIds)||!validIds(review.cashAccountIds)||selection.asOf<'2025-09-28')throw new Error('Invalid liquidity review')
  const investments=review.investmentIds.map(id=>allocation.selected.find(v=>v.investmentId===id)),cash=review.cashAccountIds.map(id=>sources.cash.find(a=>a.accountId===id))
  if(investments.some(v=>!v)||cash.some(a=>!a))throw new Error('Liquidity sources must be selected in the portfolio')
  const amount=investments.reduce((n,v)=>n+BigInt(v!.amountMinor),0n)+cash.reduce((n,a)=>n+BigInt(a!.netDebit),0n),total=BigInt(allocation.total)
  liquidity={investmentIds:[...review.investmentIds],cashAccountIds:[...review.cashAccountIds],amountMinor:String(amount),basisPoints:String((amount*10000n+total/2n)/total),comparison:amount*10n<total?'below':'within'}
 }
 let turboReview:undefined|{deals:{investmentId:string;name:string;amountMinor:string;basisPoints:string;comparison:'above'|'within';memoReference:string|null}[];totalMinor:string;totalBasisPoints:string;totalComparison:'above'|'within'}
 if(selection.turboReview!==undefined){
  const ids=selection.turboReview?.investmentIds
  if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!id||id.length>128||id!==id.trim())||new Set(ids).size!==ids.length)throw new Error('Invalid Turbo review')
  const refs=selection.turboReview?.memoReferences??{}
  if(!refs||typeof refs!=='object'||Array.isArray(refs)||Object.entries(refs).some(([id,ref])=>!ids.includes(id)||typeof ref!=='string'||!ref.trim()||ref!==ref.trim()||ref.length>450||/[\u0000-\u001f\u007f]/.test(ref)))throw new Error('Invalid Turbo memo reference')
  const total=BigInt(allocation.total)
  const deals=ids.map(id=>{const v=allocation.selected.find(x=>x.investmentId===id);if(!v)throw new Error('Turbo investments must be selected in the portfolio');const value=BigInt(v.amountMinor);return {investmentId:id,name:v.name,memoReference:Object.hasOwn(refs,id)?refs[id]:null,amountMinor:v.amountMinor,basisPoints:String((value*10000n+total/2n)/total),comparison:value*10n>total?'above' as const:'within' as const}})
  turboReview={deals,...turboSummary(deals,allocation.total)}
 }
 let equityReview:ReturnType<typeof equityConcentration>|undefined
 if(selection.equityReview!==undefined){
  const classifications=selection.equityReview?.classifications
  const validLabel=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=120&&v===v.trim()&&!/[\u0000-\u001f\u007f]/.test(v)
  if(!Array.isArray(classifications)||classifications.length>100||classifications.some(c=>!c||typeof c.investmentId!=='string'||!c.investmentId||c.investmentId.length>128||!validLabel(c.company)||!validLabel(c.sector))||new Set(classifications.map(c=>c.investmentId)).size!==classifications.length)throw new Error('Invalid equity review')
  const positions=classifications.map(c=>{const v=allocation.selected.find(x=>x.investmentId===c.investmentId);if(!v)throw new Error('Equity investments must be selected in the portfolio');return {investmentId:c.investmentId,company:c.company,sector:c.sector,name:v.name,amountMinor:v.amountMinor}})
  equityReview=equityConcentration(positions)
 }
 return {allocation,sources,...(liquidity?{liquidity}:{}),...(turboReview?{turboReview}:{}),...(equityReview?{equityReview}:{}),overlapReviewed:true as const,investmentSnapshotFrom:before.snapshotAt,investmentSnapshotTo:after.snapshotAt}
}
