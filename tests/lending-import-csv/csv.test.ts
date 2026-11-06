import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLendingCsv } from '../../src/lib/lending-import/csv.ts'
const loans='source_ref,member_number,principal_minor,currency,disbursement_date,maturity_date,terms\n'
const repayments='source_ref,loan_source_ref,payment_date,amount_minor,reference,notes\n'
test('loan CSV preserves identifiers and handles quoted commas and newlines',()=>{
 const r=parseLendingCsv('loan',loans+'L-001,00017,100000,UGX,2026-01-01,,"Terms, first\nsecond"')
 assert.deepEqual(r.errors,[]); assert.deepEqual(r.rows,[{sourceRef:'L-001',memberNumber:'00017',principalMinor:'100000',currency:'UGX',disbursementDate:'2026-01-01',maturityDate:null,terms:'Terms, first\nsecond'}])
})
test('repayment CSV preserves loan references and optional fields',()=>{
 const r=parseLendingCsv('repayment',repayments+'P-001,L-001,2026-02-01,500,,"paid, locally"')
 assert.deepEqual(r.errors,[]); assert.deepEqual(r.rows,[{sourceRef:'P-001',loanSourceRef:'L-001',paymentDate:'2026-02-01',amountMinor:'500',reference:null,notes:'paid, locally'}])
})
test('rejects invalid dates, amount precision, duplicate references and malformed CSV',()=>{
 assert.ok(parseLendingCsv('loan',loans+'X,1,9007199254740992,UGX,2026-02-30,,T\nX,2,0,xx,2026-01-01,2025-01-01,').errors.length>=5)
 assert.ok(parseLendingCsv('repayment',repayments+'X,L,2026-01-01,10,,"bad').errors.length)
 assert.ok(parseLendingCsv('repayment','"source_ref,loan_source_ref",payment_date,amount_minor,reference,notes\nX,L,2026-01-01,10,,').errors.length)
 assert.ok(parseLendingCsv('loan',loans+Array.from({length:101},(_,i)=>`L${i},M${i},1,UGX,2026-01-01,,T`).join('\n')).errors.length)
})
test('reserves id: prefix for explicit existing loan lookup',()=>{
 assert.ok(parseLendingCsv('loan',loans+'id:123,00017,100000,UGX,2026-01-01,,T').errors.some(e=>e.includes('reserved')))
 assert.deepEqual(parseLendingCsv('repayment',repayments+'P1,id:123,2026-02-01,500,,').errors,[])
})
