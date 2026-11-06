import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { calculateAllocation } from '../../src/server/allocation/calculate.ts'
import { allocationCsv } from '../../src/lib/allocation-export/export.ts'

test('exports selected observations, policy, exact values and exclusions safely', () => {
 const data = {
  snapshotAt:'2026-11-05T11:00:00.000Z',
  investments: [
   {id:'i1',name:' =HYPERLINK("evil")',assetClass:'Bonds',currency:'UGX',status:'active'},
   {id:'i2',name:'Excluded, bond',assetClass:'Bonds',currency:'USD',status:'closed'},
  ],
  valuations: [{id:'v1',investmentId:'i1',valuationDate:'2026-02-01',amountMinor:'9007199254740991',currency:'UGX',basis:'Market, quoted',source:'\t+formula'}],
  policies: [{id:'=policy-001',assetClass:'Debt',effectiveDate:'2026-01-01',minBasisPoints:1000,maxBasisPoints:2500,targetBasisPoints:2000,source:'Policy source'}],
 }
 const result = calculateAllocation(data,'UGX','2026-03-31',{i1:'v1'},{Bonds:'=policy-001'})
 const csv=allocationCsv(result)
 assert.ok(csv.startsWith('\ufeff'))
 assert.ok(csv.includes('\"Data snapshot (UTC)\",\"2026-11-05T11:00:00.000Z\"'))
 assert.ok(csv.includes('"As-of date","2026-03-31"'))
 assert.ok(csv.includes('"\'9007199254740991"'))
 assert.ok(csv.includes('"\' =HYPERLINK(""evil"")"'))
 assert.ok(csv.includes('"\'\t+formula"'))
 assert.ok(csv.includes('"1000"') && csv.includes('"2500"') && csv.includes('"Policy source"'))
 assert.ok(csv.includes('"Selected policy ID"'))
 assert.ok(csv.includes('"\'=policy-001"'))
 assert.ok(csv.includes('"Selected observations"') && csv.includes('"Excluded investments"'))
 assert.ok(csv.includes('"Excluded, bond"') && csv.includes('"closed"'))
 assert.ok(csv.includes('not a complete portfolio valuation') && csv.includes('import columns as text'))
})

test('export identifies a class with no selected policy without inventing a range', () => {
 const result=calculateAllocation({snapshotAt:'2026-11-05T11:00:00.000Z',investments:[{id:'i',name:'Bond',assetClass:'Bonds',currency:'UGX',status:'active'}],valuations:[{id:'v',investmentId:'i',valuationDate:'2026-01-01',amountMinor:'20',currency:'UGX',basis:'Cost',source:null}],policies:[]},'UGX','2026-01-01',{i:'v'}, {})
 const csv=allocationCsv(result)
 assert.ok(csv.includes('"not compared"'))
 assert.ok(csv.includes('"Excluded investments"'))
})
