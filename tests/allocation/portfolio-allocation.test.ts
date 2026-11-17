import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { calculatePortfolioAllocation } from '../../src/server/allocation/portfolio.ts'

const data = {
 snapshotAt: '2026-11-14T00:00:00.000Z',
 investments: [{id:'i',name:'Bond',assetClass:'Bonds',currency:'UGX',status:'active'}],
 valuations: [{id:'v',investmentId:'i',valuationDate:'2026-10-01',amountMinor:'100',currency:'UGX',basis:'Market',source:'statement'}],
 policies: [{id:'p',assetClass:'Member credit',effectiveDate:'2025-09-28',minBasisPoints:3500,maxBasisPoints:4500,targetBasisPoints:null,source:'IPS'}],
}
const cash = {kind:'cash' as const,id:'cash-1',name:'Current account',assetClass:'Cash',currency:'UGX',asOf:'2026-11-01',amountMinor:'50',source:'posted trial balance'}
const lending = {kind:'lending' as const,id:'lending',name:'Provisional principal',assetClass:'Member credit',currency:'UGX',asOf:'2026-11-01',amountMinor:'100',source:'calculated lending'}
const run = (supplements = [cash, lending]) => calculatePortfolioAllocation(data,'UGX','2026-11-01',{i:'v'},{'Member credit':'p'},[],supplements)

test('combines selected values with reviewed sources using the same exact denominator', () => {
 const result = run()
 assert.equal(result.total, '250')
 assert.equal(result.policyGroups[0].amountMinor, '100')
 assert.equal(result.policyGroups[0].comparison, 'within')
 assert.deepEqual(result.supplementalSources, [cash,lending])
 assert.deepEqual(result.selected.map(v=>v.id), ['v'])
})
test('rejects duplicate sources, mismatched currencies, dates and invalid amounts', () => {
 assert.throws(()=>run([cash,cash]),/duplicate/i)
 assert.throws(()=>run([{...cash,currency:'USD'}]),/currency/i)
 assert.throws(()=>run([{...cash,asOf:'2026-10-31'}]),/date/i)
 assert.throws(()=>run([{...cash,amountMinor:'-1'}]),/amount/i)
 assert.throws(()=>run([lending,{...lending,id:'other'}]),/lending/i)
})
test('can compare reviewed balances without selecting an investment valuation', () => {
 const result=calculatePortfolioAllocation(data,'UGX','2026-11-01',{}, {'Member credit':'p'}, [], [cash,lending])
 assert.equal(result.total,'150')
 assert.equal(result.policyGroups[0].comparison,'above')
 assert.deepEqual(result.excluded.map(i=>i.id),['i'])
})

test('single-investment screen uses cash and lending in the selected denominator',async()=>{
 const {screenInvestmentConcentration}=await import('../../src/lib/allocation-concentration.ts')
 const {allocationCsv}=await import('../../src/lib/allocation-export/export.ts')
 const combined=run(),withoutSupplements=run([])
 assert.deepEqual(screenInvestmentConcentration(combined)?.map(r=>[r.investmentId,r.basisPoints,r.comparison]),[['i','4000','within']])
 assert.deepEqual(screenInvestmentConcentration(withoutSupplements)?.map(r=>[r.investmentId,r.basisPoints,r.comparison]),[['i','10000','above']])
 const csv=allocationCsv(combined,true)
 assert.match(csv,/"i","Bond","4000","within"/)
 assert.ok(!csv.includes('"cash-1","Current account","2000"'))
})
