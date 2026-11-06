import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { budgetComparisonCsv, budgetComparisonCaveats } from '../../src/lib/budget-export/export.ts'
import type { compareBudget } from '../../src/server/budgets/service.ts'

test('exports selected budget, transactions, exclusions and exact safely encoded amounts', () => {
 const result = {
  snapshotAt:'2026-11-05T11:00:00.000Z',
  budget:{id:'b',category:' =HYPERLINK("bad")',periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'UGX',amountMinor:'9007199254740991',source:'Source, "A"',createdBy:'admin'},
  selected:[{id:'s',investment:'Bond',transactionDate:'2026-04-01',type:'Income',currency:'UGX',amountMinor:'9007199254740991',reference:'\t=1+1'}],
  excluded:[{id:'x',investment:'Foreign',transactionDate:'2025-01-01',type:'Purchase',currency:'USD',amountMinor:'42',reference:null}],
  comparisonBasis:'investment',selectedTotal:'18014398509481982',difference:'9007199254740991',
 } satisfies Awaited<ReturnType<typeof compareBudget>>
 const csv=budgetComparisonCsv(result)
 assert.ok(csv.startsWith('\ufeff'))
 assert.ok(csv.includes('\"Data snapshot (UTC)\",\"2026-11-05T11:00:00.000Z\"'))
 assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"'))
 assert.ok(csv.includes('"Source, ""A"""'))
 assert.ok(csv.includes('"\'\t=1+1"'))
 assert.ok(csv.includes('"\'18014398509481982"'))
 assert.ok(csv.includes('"2026-01-01"') && csv.includes('"2026-12-31"'))
 assert.ok(csv.includes('"Selected transactions"') && csv.includes('"Excluded investment transactions"'))
 assert.ok(csv.includes('"Foreign"') && csv.includes('"USD"') && csv.includes('"2025-01-01"'))
 assert.ok(csv.includes('not necessarily a financial variance'))
 assert.ok(csv.includes('import columns as text'))
 assert.ok(budgetComparisonCaveats().some(s=>s.includes('later void')))
})

test('empty selection is explicitly described, without inventing actual activity',()=>{
 const csv=budgetComparisonCsv({snapshotAt:'2026-11-05T11:00:00.000Z',budget:{id:'b',category:'test',periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'UGX',amountMinor:'100',source:'doc',createdBy:'a'},selected:[],excluded:[],selectedTotal:'0',difference:'-100'})
 assert.ok(csv.includes('does not establish that actual activity was zero'))
 assert.ok(csv.includes('"\'-100"'))
 assert.ok(csv.includes('Cash activity not captured in this comparison'))
})

test('exports cash selections and exclusions separately with exact and safe values',()=>{
 const csv=budgetComparisonCsv({snapshotAt:'2026-11-05T11:00:00.000Z',budget:{id:'b',category:'test',periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'UGX',amountMinor:'100',source:'doc',createdBy:'a'},selected:[],excluded:[],selectedTotal:'0',difference:'-100',cash:{selected:[{id:'c',entryDate:'2026-03-01',direction:'receipt',currency:'UGX',amountMinor:'900719925474099199999999',counterparty:'=bad',reference:'001',description:'Receipt'}],excluded:[{id:'x',entryDate:'2026-03-02',direction:'payment',currency:'UGX',amountMinor:'10',counterparty:'Other',reference:'',description:'Excluded'}],receiptsTotal:'900719925474099199999999',paymentsTotal:'0'}})
 assert.ok(csv.includes('Selected cash records'))
 assert.ok(csv.includes('Excluded cash records'))
 assert.ok(csv.includes('"\'900719925474099199999999"'))
 assert.ok(csv.includes('"\'=bad"'))
 assert.ok(csv.includes('"001"'))
 assert.ok(csv.includes('"Excluded"'))
 assert.ok(!csv.includes('Cash activity not captured in this comparison'))
})

test('exports the chosen comparison basis and reads older snapshots as investment comparisons',()=>{
 const legacy={snapshotAt:'2026-11-05T11:00:00.000Z',budget:{id:'b',category:'test',periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'UGX',amountMinor:'100',source:'doc',createdBy:'a'},selected:[],excluded:[],selectedTotal:'0',difference:'-100'}
 assert.ok(budgetComparisonCsv(legacy).includes('"Comparison basis","Investment transactions"'))
 const cash={...legacy,comparisonBasis:'cash_payments' as const,selectedTotal:'20',difference:'-80',cash:{selected:[],excluded:[],receiptsTotal:'0',paymentsTotal:'20'}}
 assert.ok(budgetComparisonCsv(cash).includes('"Comparison basis","Cash payments"'))
})
