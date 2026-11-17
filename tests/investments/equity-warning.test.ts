import {test,expect} from 'vitest'
import {equityDipReview} from '../../src/server/investments/equity-warning'
const prior={id:'a',investmentId:'i',currency:'UGX',amountMinor:1000000,valuationDate:'2026-01-01',basis:'market',source:'reviewed'}
const current={...prior,id:'b',valuationDate:'2026-02-01'}
test('uses exact values at the 20% decline threshold',()=>{
 expect(equityDipReview(prior,{...current,amountMinor:800001})?.reviewRequired).toBe(false)
 expect(equityDipReview(prior,{...current,amountMinor:800000})?.reviewRequired).toBe(true)
 expect(equityDipReview(prior,{...current,amountMinor:799999})?.reviewRequired).toBe(true)
})
test('rejects a zero baseline, mismatched records and non-increasing dates',()=>{
 expect(equityDipReview({...prior,amountMinor:0},current)).toBeNull()
 expect(equityDipReview(prior,{...current,investmentId:'other'})).toBeNull()
 expect(equityDipReview(prior,{...current,currency:'USD'})).toBeNull()
 expect(equityDipReview(prior,{...current,valuationDate:prior.valuationDate})).toBeNull()
 expect(equityDipReview(prior,prior)).toBeNull()
 expect(equityDipReview({...prior,valuationDate:'2025-01-01'},{...current,valuationDate:'2025-09-27'})).toBeNull()
})
test('does not trigger an early warning from a future-dated valuation',()=>{
 expect(equityDipReview(prior,{...current,amountMinor:700000,valuationDate:'2026-04-01'},'2026-03-31')).toBeNull()
 expect(equityDipReview(prior,{...current,amountMinor:700000,valuationDate:'2026-04-01'},'2026-04-01')?.reviewRequired).toBe(true)
})
