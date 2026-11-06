import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { trialBalanceCsv, trialBalanceCaveat } from '../../src/lib/trial-balance-export/export.ts'
import type { trialBalance } from '../../src/server/trial-balance/service.ts'

test('exports the selected trial balance, exact amounts, currencies, and interpretation', () => {
 const result = { asOf:'2026-04-30', accounts:[
  {accountId:'a',code:'001',name:' =HYPERLINK("bad")',currency:'UGX',debits:'18014398509481982',credits:'1',netDebit:'18014398509481981',netCredit:'0'},
  {accountId:'b',code:'002',name:'Cash, USD',currency:'USD',debits:'5',credits:'3',netDebit:'2',netCredit:'0'},
 ],totals:[
  {currency:'UGX',debits:'18014398509481982',credits:'1',netDebit:'18014398509481981',netCredit:'0'},
  {currency:'USD',debits:'5',credits:'3',netDebit:'2',netCredit:'0'},
 ] } satisfies Awaited<ReturnType<typeof trialBalance>>
 const csv = trialBalanceCsv(result)
 assert.ok(csv.startsWith('\ufeff'))
 assert.ok(csv.includes('"As-of date","2026-04-30"'))
 assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"'))
 assert.ok(csv.includes('"\'18014398509481982"'))
 assert.ok(csv.includes('"Cash, USD"'))
 assert.ok(csv.includes('"Accounts"') && csv.includes('"Totals by currency"'))
 assert.ok(csv.includes('"UGX"') && csv.includes('"USD"'))
 assert.ok(csv.includes('not an approved financial statement'))
 assert.ok(trialBalanceCaveat(result.asOf).includes('backdated'))
 assert.ok(csv.includes('import columns as text'))
})

test('exports empty sections without inventing entries', () => {
 const csv=trialBalanceCsv({asOf:'2026-01-01',accounts:[],totals:[]})
 assert.ok(csv.includes('"Accounts"'))
 assert.ok(csv.includes('"Totals by currency"'))
})
