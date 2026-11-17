import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { estimateLoanInterest } from '../../src/lib/loan-estimate/estimate.ts'

test('estimates 2% for 60 actual elapsed days without compounding', () => {
 const result=estimateLoanInterest({principalMinor:'1000000',startDate:'2026-01-01',asOfDate:'2026-03-02',rateBasisPoints:200,periodDays:60,principalReductions:[],rounding:'half-up'})
 assert.equal(result.interestMinor,'20000');assert.equal(result.principalMinor,'1000000');assert.equal(result.elapsedDays,60)
})
test('reduces principal on the specified date and sums fractions before rounding', () => {
 const result=estimateLoanInterest({principalMinor:'10000',startDate:'2026-01-01',asOfDate:'2026-03-02',rateBasisPoints:200,periodDays:60,principalReductions:[{date:'2026-01-31',amountMinor:'5000'}],rounding:'half-up'})
 assert.equal(result.interestMinor,'150');assert.equal(result.principalMinor,'5000')
})
test('rounding is explicit and handles amounts beyond floating-point precision', () => {
 const base={principalMinor:'9007199254740993',startDate:'2026-01-01',asOfDate:'2026-01-02',rateBasisPoints:1,periodDays:2,principalReductions:[]}
 assert.equal(estimateLoanInterest({...base,rounding:'down'}).interestMinor,'450359962737')
 assert.equal(estimateLoanInterest({...base,rounding:'half-up'}).interestMinor,'450359962737')
 const small={...base,principalMinor:'10000',rateBasisPoints:1}
 assert.equal(estimateLoanInterest({...small,rounding:'down'}).interestMinor,'0')
 assert.equal(estimateLoanInterest({...small,rounding:'half-up'}).interestMinor,'1')
})
test('rejects invalid dates and reductions outside the period or above principal', () => {
 const base={principalMinor:'100',startDate:'2026-01-01',asOfDate:'2026-02-01',rateBasisPoints:200,periodDays:60,principalReductions:[],rounding:'half-up' as const}
 assert.throws(()=>estimateLoanInterest({...base,asOfDate:'2026-02-30'}))
 assert.throws(()=>estimateLoanInterest({...base,principalReductions:[{date:'2025-12-31',amountMinor:'1'}]}))
 assert.throws(()=>estimateLoanInterest({...base,principalReductions:[{date:'2026-01-02',amountMinor:'101'}]}))
 assert.throws(()=>estimateLoanInterest({...base,periodDays:0}))
})
test('same-day principal reductions apply before subsequent days and leap days count', () => {
 const result=estimateLoanInterest({principalMinor:'6000',startDate:'2024-02-28',asOfDate:'2024-03-01',rateBasisPoints:200,periodDays:60,principalReductions:[{date:'2024-02-28',amountMinor:'3000'}],rounding:'half-up'})
 assert.equal(result.elapsedDays,2);assert.equal(result.interestMinor,'2');assert.equal(result.principalMinor,'3000')
})
