import test from 'node:test'
import assert from 'node:assert/strict'
import {parseInvestmentCsv} from '../../src/lib/investment-import/csv.ts'
const investments='source_ref,name,asset_class,currency,status\n'
const valuations='source_ref,investment_ref,valuation_date,amount_minor,basis,source,notes\n'
const transactions='source_ref,investment_ref,transaction_date,transaction_type,amount_minor,reference,notes\n'
test('preserves investment source references and quoted fields',()=>{
 const r=parseInvestmentCsv('investment',investments+'I-001,"Property, joint",Real estate,UGX,closed')
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.rows,[{sourceRef:'I-001',name:'Property, joint',assetClass:'Real estate',currency:'UGX',status:'closed'}])
})
test('preserves explicit valuation basis and zero amounts',()=>{
 const r=parseInvestmentCsv('valuation',valuations+'V-001,I-001,2026-01-01,0,Market,Independent report,')
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.rows,[{sourceRef:'V-001',investmentRef:'I-001',valuationDate:'2026-01-01',amountMinor:'0',basis:'Market',source:'Independent report',notes:null}])
})
test('preserves transaction notes and direct IDs',()=>{
 const r=parseInvestmentCsv('transaction',transactions+'T-001,id:abc,2026-01-02,Dividend,200,,"Cash, received"')
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.rows,[{sourceRef:'T-001',investmentRef:'id:abc',transactionDate:'2026-01-02',transactionType:'Dividend',amountMinor:'200',reference:null,notes:'Cash, received'}])
})
test('rejects reserved investment refs, invalid dates, unsafe amounts, duplicates and malformed CSV',()=>{
 assert.ok(parseInvestmentCsv('investment',investments+'id:abc,X,Bond,UGX,active').errors.length)
 assert.ok(parseInvestmentCsv('valuation',valuations+'V,I,2026-02-30,9007199254740992,B,S,\nV,I,2026-01-01,-1,B,S,').errors.length>=4)
 assert.ok(parseInvestmentCsv('transaction',transactions+'T,I,2026-01-01,Dividend,0,,').errors.length)
 assert.ok(parseInvestmentCsv('investment',investments+'I,"bad,Bond,UGX').errors.length)
})
