import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { projectRepaymentSchedule } from '../../src/lib/loan-billing/projection.ts'

test('forecasts principal at end using the current actual-day billing rules rather than the demo monthly rate', () => {
 const result=projectRepaymentSchedule({kind:'original',principalMinor:'22000000',disbursementDate:'2026-05-12',rateBasisPoints:500,periodDays:180,repayments:[],asOfDate:'2026-05-12',firstDueDate:'2026-06-12',cadenceMonths:1,installments:6,principalStyle:'end'})
 assert.deepEqual(result.rows.map(r=>r.date),['2026-06-12','2026-07-12','2026-08-12','2026-09-12','2026-10-12','2026-11-12'])
 assert.deepEqual(result.rows.map(r=>r.principalMinor),['0','0','0','0','0','22000000'])
 assert.equal(result.totalInterestMinor,'1124444')
 assert.equal(result.rows.at(-1)?.remainingPrincipalMinor,'0')
})

test('distributes equal principal exactly and retains day-of-month after shorter months', () => {
 const result=projectRepaymentSchedule({kind:'original',principalMinor:'1001',disbursementDate:'2024-01-01',rateBasisPoints:0,periodDays:60,repayments:[{id:'real',date:'2024-01-15',amountMinor:'1'}],asOfDate:'2024-01-15',firstDueDate:'2024-01-31',cadenceMonths:1,installments:3,principalStyle:'equal'})
 assert.deepEqual(result.rows.map(r=>r.date),['2024-01-31','2024-02-29','2024-03-31'])
 assert.deepEqual(result.rows.map(r=>r.principalMinor),['334','333','333'])
 assert.equal(result.startingPrincipalMinor,'1000')
})

test('separately carries unpaid opening interest and accounts for a reviewed future rate', () => {
 const result=projectRepaymentSchedule({kind:'opening',originalPrincipalMinor:'10000',disbursementDate:'2026-01-01',openingDate:'2026-03-05',openingPrincipalMinor:'8000',openingInterestDueMinor:'300',openingRecognizedInterestMinor:'400',minimumAssessed:true,rateBasisPoints:200,periodDays:60,cutoffRateBasisPoints:500,cutoffPeriodDays:180,repayments:[],rateChanges:[{effectiveDate:'2026-03-15',rateBasisPoints:200,periodDays:30}],asOfDate:'2026-03-05',firstDueDate:'2026-04-05',cadenceMonths:1,installments:2,principalStyle:'end'})
 assert.equal(result.startingInterestDueMinor,'300')
 assert.ok(BigInt(result.rows[0].interestMinor)>300n)
 assert.equal(result.rows.at(-1)?.remainingPrincipalMinor,'0')
})

test('rejects dates or counts that cannot form a forecast', () => {
 const base={kind:'original' as const,principalMinor:'1000',disbursementDate:'2026-01-01',rateBasisPoints:200,periodDays:60 as const,repayments:[],asOfDate:'2026-01-15',firstDueDate:'2026-01-15',cadenceMonths:1 as const,installments:1,principalStyle:'end' as const}
 assert.throws(()=>projectRepaymentSchedule(base),/after/i)
 assert.throws(()=>projectRepaymentSchedule({...base,firstDueDate:'2026-02-15',installments:0}),/installments/i)
})

test('settling before day 60 includes the original minimum adjustment', () => {
 const result=projectRepaymentSchedule({kind:'original',principalMinor:'100000',disbursementDate:'2026-01-01',rateBasisPoints:200,periodDays:60,repayments:[],asOfDate:'2026-01-10',firstDueDate:'2026-01-20',cadenceMonths:1,installments:1,principalStyle:'end'})
 assert.equal(result.rows[0].interestMinor,'2000')
 assert.equal(result.rows[0].paymentMinor,'102000')
 assert.equal(result.rows[0].remainingInterestMinor,'0')
})

test('equal-principal forecasts include the minimum if rounding pays off tiny principal before the final row', () => {
 const result=projectRepaymentSchedule({kind:'original',principalMinor:'2',disbursementDate:'2026-01-01',rateBasisPoints:10000,periodDays:30,repayments:[],asOfDate:'2026-01-01',firstDueDate:'2026-01-02',cadenceMonths:1,installments:3,principalStyle:'equal'})
 assert.equal(result.rows[0].principalMinor,'1')
 assert.equal(result.rows[1].principalMinor,'1')
 assert.equal(result.rows[1].remainingPrincipalMinor,'0')
 assert.equal(result.rows[1].remainingInterestMinor,'0')
})

test('a changed rate applies after its effective date and forecast does not mutate input', () => {
 const input={kind:'original' as const,principalMinor:'100000',disbursementDate:'2026-01-01',rateBasisPoints:200,periodDays:60 as const,repayments:[],rateChanges:[{effectiveDate:'2026-03-01',rateBasisPoints:0,periodDays:60 as const}],asOfDate:'2026-03-01',firstDueDate:'2026-04-01',cadenceMonths:1 as const,installments:1,principalStyle:'end' as const}
 const before=JSON.stringify(input),result=projectRepaymentSchedule(input)
 assert.equal(result.rows[0].interestMinor,'2000')
 assert.equal(JSON.stringify(input),before)
})

test('forecast payments reconcile to principal and interest across uneven installment counts', () => {
 for (const principalMinor of ['1','2','17','1001','100000']) for (const installments of [1,2,7]) for (const principalStyle of ['equal','end'] as const) {
  const result=projectRepaymentSchedule({kind:'original',principalMinor,disbursementDate:'2026-01-01',rateBasisPoints:500,periodDays:180,repayments:[],asOfDate:'2026-01-01',firstDueDate:'2026-01-27',cadenceMonths:1,installments,principalStyle})
  assert.equal(result.totalPrincipalMinor,principalMinor)
  assert.equal(result.rows.at(-1)?.remainingPrincipalMinor,'0')
  assert.equal(result.rows.at(-1)?.remainingInterestMinor,'0')
  assert.equal(result.totalPaymentMinor,String(BigInt(result.totalPrincipalMinor)+BigInt(result.totalInterestMinor)))
  for(const row of result.rows)assert.equal(row.paymentMinor,String(BigInt(row.principalMinor)+BigInt(row.interestMinor)))
 }
})
