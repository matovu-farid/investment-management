import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {reviewPortfolioAllocation} from '../../src/server/allocation/portfolio-review.ts'
const data={snapshotAt:'2026-11-14T12:00:00.000Z',investments:[{id:'i',name:'Bond',assetClass:'Bonds',currency:'UGX',status:'active'}],valuations:[{id:'v',investmentId:'i',valuationDate:'2026-01-01',amountMinor:'100',currency:'UGX',basis:'Cost',source:'records'}],policies:[{id:'p',assetClass:'Member credit',effectiveDate:'2025-09-28',minBasisPoints:3000,maxBasisPoints:5000,targetBasisPoints:null,source:'IPS'}]}
const sources={asOf:'2026-11-01',currency:'UGX',capturedFrom:'2026-11-14T12:00:00.000Z',capturedTo:'2026-11-14T12:00:01.000Z',cash:[{accountId:'c',code:'100',name:'Bank',currency:'UGX',debits:'70',credits:'20',netDebit:'50',netCredit:'0'}],lending:{asOf:'2026-11-01',eligible:2,included:1,omitted:{unconfigured:1,pendingRepayments:0,unavailable:0},totals:[{currency:'UGX',principalMinor:'90',interestMinor:'10'}]}}
const input={asOf:'2026-11-01',currency:'UGX',cashAccountIds:['c'],includeLending:true,selected:{i:'v'},mappings:{'Member credit':'p'},zeroPolicyIds:[],overlapReviewed:true}
const deps={data:async()=>data,sources:async()=>sources}
const db={} as D1Database

test('combines captured sources and retains lending coverage and provenance',async()=>{
 const result=await reviewPortfolioAllocation(db,'admin',input,deps)
 assert.equal(result.allocation.total,'250');assert.equal(result.allocation.policyGroups[0].comparison,'within')
 assert.equal(result.sources.lending?.omitted.unconfigured,1);assert.equal(result.sources.lending?.totals[0].interestMinor,'10')
 assert.deepEqual(result.allocation.supplementalSources.map(x=>x.kind),['cash','lending'])
})
test('requires explicit overlap review and rejects source changes while capturing investments',async()=>{
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,overlapReviewed:false},deps),/overlap/i)
 let calls=0
 const racing={...deps,data:async()=>++calls===1?data:{...data,valuations:[{...data.valuations[0],amountMinor:'101'}]}}
 await assert.rejects(reviewPortfolioAllocation(db,'admin',input,racing),/changed/i)
})

test('rejects malformed selections and mappings without selected classes',async()=>{
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,selected:{i:123} as never},deps),/selection/i)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,mappings:{Missing:'p'}},deps),/class/i)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,zeroPolicyIds:['p','p']},deps),/duplicate/i)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,selected:Object.fromEntries(Array.from({length:101},(_,i)=>['i'+i,'v']))},deps),/selection/i)
})

test('combined export preserves source evidence, omissions and selected-subset warning',async()=>{
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 const result=await reviewPortfolioAllocation(db,'admin',input,deps)
 const csv=combinedAllocationCsv(result)
 assert.match(csv,/not a complete portfolio/i)
 assert.match(csv,/"Bank"/)
 assert.match(csv,/"unconfigured","1"/i)
 assert.match(csv,/"UGX","90","10"/)
 assert.match(csv,/overlap/i)
 assert.match(csv,/Cash and lending capture from \(UTC\)/)
 assert.doesNotMatch(csv,/only selected investment valuations contribute/i)
})

test('combined export remains readable for drafts saved before source windows were recorded',async()=>{
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 const result=await reviewPortfolioAllocation(db,'admin',input,deps)
 const old={...result,sources:{...result.sources,capturedFrom:undefined,capturedTo:undefined}} as unknown as typeof result
 assert.match(combinedAllocationCsv(old),/Not recorded in this draft/)
})

test('liquidity review uses only explicitly designated selected sources and retains their evidence',async()=>{
 const result=await reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:[],cashAccountIds:['c']}},deps)
 assert.equal(result.liquidity?.amountMinor,'50');assert.equal(result.liquidity?.basisPoints,'2000');assert.equal(result.liquidity?.comparison,'within')
 assert.deepEqual(result.liquidity?.cashAccountIds,['c'])
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 const csv=combinedAllocationCsv(result);assert.match(csv,/Selected-source liquidity review/);assert.match(csv,/\"Liquid cash account ID\"/);assert.match(csv,/\"c\"/)
 const zero=await reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:[],cashAccountIds:[]}},deps)
 assert.equal(zero.liquidity?.comparison,'below')
 const investment=await reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:['i'],cashAccountIds:[]}},deps)
 assert.equal(investment.liquidity?.amountMinor,'100')
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:['other'],cashAccountIds:[]}},deps),/liquid/i)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:[],cashAccountIds:['c','c']}},deps),/liquid/i)
})

test('liquidity threshold is based on the exact fraction and rejects prior policy dates',async()=>{
 const near={...sources,cash:[{...sources.cash[0],netDebit:'25'}],lending:{...sources.lending,totals:[{currency:'UGX',principalMinor:'125',interestMinor:'0'}]}}
 const result=await reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:[],cashAccountIds:['c']}},{...deps,sources:async()=>near})
 assert.equal(result.allocation.total,'250');assert.equal(result.liquidity?.comparison,'within')
 const below={...near,cash:[{...near.cash[0],netDebit:'24'}],lending:{...near.lending,totals:[{currency:'UGX',principalMinor:'126',interestMinor:'0'}]}}
 assert.equal((await reviewPortfolioAllocation(db,'admin',{...input,liquidityReview:{investmentIds:[],cashAccountIds:['c']}},{...deps,sources:async()=>below})).liquidity?.comparison,'below')
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,asOf:'2025-09-27',liquidityReview:{investmentIds:[],cashAccountIds:[]}},deps),/liquidity/i)
})

test('liquidity decision uses exact values even when display rounds to 10.00%',async()=>{
 const roundData={...data,valuations:[{...data.valuations[0],amountMinor:'900001'}]}
 const roundSources={...sources,cash:[{...sources.cash[0],netDebit:'99999'}],lending:null}
 const selection={...input,includeLending:false,mappings:{},liquidityReview:{investmentIds:[],cashAccountIds:['c']}}
 const result=await reviewPortfolioAllocation(db,'admin',selection,{data:async()=>roundData,sources:async()=>roundSources})
 assert.equal(result.allocation.total,'1000000')
 assert.equal(result.liquidity?.basisPoints,'1000')
 assert.equal(result.liquidity?.comparison,'below')
})

test('explicit Turbo review screens selected investments and retains classifications',async()=>{
 const reviewed=await reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['i']}},deps)
 assert.deepEqual(reviewed.turboReview?.deals.map(d=>[d.investmentId,d.comparison,d.basisPoints]),[['i','above','4000']])
 assert.equal(reviewed.turboReview?.totalMinor,'100');assert.equal(reviewed.turboReview?.totalBasisPoints,'4000');assert.equal(reviewed.turboReview?.totalComparison,'above')
 const empty=await reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:[]}},deps)
 assert.deepEqual(empty.turboReview?.deals,[]);assert.equal(empty.turboReview?.totalMinor,'0');assert.equal(empty.turboReview?.totalComparison,'within')
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['missing']}},deps),/turbo/i)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['i','i']}},deps),/turbo/i)
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 const csv=combinedAllocationCsv(reviewed);assert.match(csv,/HIGH RISK/);assert.match(csv,/\"20% fund cap comparison\",\"above\"/)
 const legacy={...reviewed,turboReview:{deals:reviewed.turboReview!.deals}} as typeof reviewed
 assert.match(combinedAllocationCsv(legacy),/\"20% fund cap comparison\",\"above\"/)
})

test('Turbo deal threshold compares exact amounts even when display rounds to 10.00%',async()=>{
 const roundData={...data,valuations:[{...data.valuations[0],amountMinor:'100001'}]}
 const roundSources={...sources,cash:[{...sources.cash[0],netDebit:'899999'}],lending:null}
 const selection={...input,includeLending:false,mappings:{},turboReview:{investmentIds:['i']}}
 const result=await reviewPortfolioAllocation(db,'admin',selection,{data:async()=>roundData,sources:async()=>roundSources})
 assert.equal(result.turboReview?.deals[0].basisPoints,'1000')
 assert.equal(result.turboReview?.deals[0].comparison,'above')
 const exactData={...roundData,valuations:[{...roundData.valuations[0],amountMinor:'100000'}]},exactSources={...roundSources,cash:[{...roundSources.cash[0],netDebit:'900000'}]}
 assert.equal((await reviewPortfolioAllocation(db,'admin',selection,{data:async()=>exactData,sources:async()=>exactSources})).turboReview?.deals[0].comparison,'within')
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...selection,asOf:'2025-09-27'},deps),/Turbo/i)
})

test('Turbo fund cap uses exact 20% threshold',async()=>{
 const marked={...input,turboReview:{investmentIds:['i']}}
 const at={...sources,cash:[{...sources.cash[0],netDebit:'300'}],lending:{...sources.lending,totals:[{currency:'UGX',principalMinor:'100',interestMinor:'0'}]}}
 const exact=await reviewPortfolioAllocation(db,'admin',marked,{...deps,sources:async()=>at})
 assert.equal(exact.allocation.total,'500');assert.equal(exact.turboReview?.totalComparison,'within')
 const above={...at,cash:[{...at.cash[0],netDebit:'299'}]}
 assert.equal((await reviewPortfolioAllocation(db,'admin',marked,{...deps,sources:async()=>above})).turboReview?.totalComparison,'above')
})

test('Turbo review preserves only explicitly supplied memo references for marked deals',async()=>{
 const result=await reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['i'],memoReferences:{i:'Board memo 2026-01'}}},deps)
 assert.equal(result.turboReview?.deals[0].memoReference,'Board memo 2026-01')
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 assert.match(combinedAllocationCsv(result),/Board memo 2026-01/)
 const missing=await reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['i']}},deps)
 assert.equal(missing.turboReview?.deals[0].memoReference,null)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['i'],memoReferences:{other:'Wrong record'}}},deps),/memo/i)
})

test('Turbo memo references are spreadsheet-safe in the combined export',async()=>{
 const result=await reviewPortfolioAllocation(db,'admin',{...input,turboReview:{investmentIds:['i'],memoReferences:{i:'=HYPERLINK("https://example.invalid")'}}},deps)
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 assert.match(combinedAllocationCsv(result),/"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/)
})

test('equity review groups explicitly classified selected values and screens company and sector limits',async()=>{
 const d={...data,investments:[...data.investments,{id:'i2',name:'Second',assetClass:'Equities',currency:'UGX',status:'active'}],valuations:[...data.valuations,{...data.valuations[0],id:'v2',investmentId:'i2',amountMinor:'100'}]}
 const result=await reviewPortfolioAllocation(db,'admin',{...input,selected:{i:'v',i2:'v2'},equityReview:{classifications:[{investmentId:'i',company:'Company A',sector:'Banking'},{investmentId:'i2',company:'Company A',sector:'Banking'}]}},{...deps,data:async()=>d})
 assert.equal(result.equityReview?.totalMinor,'200')
 assert.equal(result.equityReview?.companies[0].basisPoints,'10000');assert.equal(result.equityReview?.companies[0].comparison,'above')
 assert.equal(result.equityReview?.sectors[0].comparison,'above')
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 assert.match(combinedAllocationCsv(result),/Company A/)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,equityReview:{classifications:[{investmentId:'missing',company:'A',sector:'B'}]}},deps),/equity/i)
 await assert.rejects(reviewPortfolioAllocation(db,'admin',{...input,equityReview:{classifications:[{investmentId:'i',company:'',sector:'B'}]}},deps),/equity/i)
})

test('equity classification names are spreadsheet-safe in exports',async()=>{
 const result=await reviewPortfolioAllocation(db,'admin',{...input,equityReview:{classifications:[{investmentId:'i',company:'=Company',sector:'+Sector'}]}},deps)
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 const csv=combinedAllocationCsv(result)
 assert.match(csv,/"'=Company"/);assert.match(csv,/"'\+Sector"/)
})

test('equity export flags companies assigned to more than one sector',async()=>{
 const d={...data,investments:[...data.investments,{id:'i2',name:'Second',assetClass:'Equities',currency:'UGX',status:'active'}],valuations:[...data.valuations,{...data.valuations[0],id:'v2',investmentId:'i2'}]}
 const equityReview={classifications:[{investmentId:'i',company:'Same',sector:'Banking'},{investmentId:'i2',company:'Same',sector:'Other'}]}
 const result=await reviewPortfolioAllocation(db,'admin',{...input,selected:{i:'v',i2:'v2'},equityReview},{...deps,data:async()=>d})
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 assert.match(combinedAllocationCsv(result),/"Companies assigned to multiple sectors","Same"/)
})
test('combined export flags similar labels while preserving their separate groups',async()=>{
 const d={...data,investments:[...data.investments,{id:'i2',name:'Second',assetClass:'Equities',currency:'UGX',status:'active'}],valuations:[...data.valuations,{...data.valuations[0],id:'v2',investmentId:'i2'}]}
 const equityReview={classifications:[{investmentId:'i',company:'Acme',sector:'Banking'},{investmentId:'i2',company:'ACME',sector:'banking'}]}
 const result=await reviewPortfolioAllocation(db,'admin',{...input,selected:{i:'v',i2:'v2'},equityReview},{...deps,data:async()=>d})
 const {combinedAllocationCsv}=await import('../../src/lib/allocation-export/combined.ts')
 const csv=combinedAllocationCsv(result);assert.match(csv,/"Similar company labels counted separately","ACME \/ Acme"/);assert.match(csv,/"Similar sector labels counted separately","Banking \/ banking"/);assert.equal(result.equityReview?.companies.length,2)
})
