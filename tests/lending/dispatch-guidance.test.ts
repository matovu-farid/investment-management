import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {dispatchAdviceLabel,dispatchGuidance} from '../../src/lib/dispatch-guidance.ts'

test('applies the protocol guidance to the selected payment route and amount',()=>{
 assert.equal(dispatchGuidance('UGX',9999999,'equity','2026-01-01'),'no-charge')
 assert.equal(dispatchGuidance('UGX',10000000,'equity','2026-01-01'),'no-charge')
 assert.equal(dispatchGuidance('UGX',9999999,'other-bank','2026-01-01'),'rtgs-estimate')
 assert.equal(dispatchGuidance('UGX',10000000,'other-bank','2026-01-01'),'boundary-review')
 assert.equal(dispatchGuidance('UGX',10000001,'other-bank','2026-01-01'),'no-charge')
 assert.equal(dispatchGuidance('UGX',10000001,'mobile-money','2026-01-01'),'mobile-cost')
 assert.equal(dispatchGuidance('UGX',1,'cash','2026-01-01'),'cash-not-allowed')
 assert.equal(dispatchGuidance('USD',1,'other-bank','2026-01-01'),'currency-review')
 assert.equal(dispatchGuidance('USD',1,'cash','2026-01-01'),'cash-not-allowed')
 assert.equal(dispatchGuidance('UGX',1,'','2026-01-01'),'route-needed')
})
test('rejects invalid amounts and unrecognized payment routes',()=>{
 assert.throws(()=>dispatchGuidance('UGX',0,'equity','2026-01-01'),/amount/i)
 assert.throws(()=>dispatchGuidance('UGX',1.5,'equity','2026-01-01'),/amount/i)
 assert.throws(()=>dispatchGuidance('UGX',1,'unknown' as never,'2026-01-01'),/route/i)
})
test('mobile-money guidance flags the overlap with the above-10-million no-charge rule',()=>{
 const advice=dispatchGuidance('UGX',10000001,'mobile-money','2026-01-01')
 assert.match(dispatchAdviceLabel[advice],/10 million/i)
 assert.match(dispatchAdviceLabel[advice],/confirm/i)
})
test('does not apply the current protocol to an earlier disbursement',()=>{
 assert.equal(dispatchGuidance('UGX',9999999,'other-bank','2025-09-27'),'before-policy')
 assert.equal(dispatchGuidance('UGX',9999999,'other-bank','2025-09-28'),'rtgs-estimate')
 assert.throws(()=>dispatchGuidance('UGX',100,'other-bank','2025-02-30'),/date/i)
})
