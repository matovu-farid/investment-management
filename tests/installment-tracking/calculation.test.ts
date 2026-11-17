import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {calculateInstallmentTracking} from '../../src/lib/installment-tracking/calculation.ts'

const rows=[{dueDate:'2026-01-31',principalMinor:'100',interestMinor:'20'},{dueDate:'2026-02-28',principalMinor:'100',interestMinor:'20'}]
const calculate=(extra:Record<string,unknown>={})=>calculateInstallmentTracking({rows,asOfDate:'2026-03-01',coverageStart:'2026-01-01',historyComplete:true,payments:[],pendingReceipts:0,...extra} as Parameters<typeof calculateInstallmentTracking>[0])
test('allocates actual components oldest first without treating unapplied money as paid',()=>{
 const r=calculate({payments:[{id:'a',date:'2026-01-20',principalMinor:'150',interestMinor:'10',unappliedMinor:'7'}]})
 assert.deepEqual(r.rows.map(x=>[x.principalPaidMinor,x.interestPaidMinor,x.principalRemainingMinor,x.interestRemainingMinor]),[['100','10','0','10'],['50','0','50','20']])
 assert.equal(r.unappliedMinor,'7');assert.equal(r.oldestUnpaidDueDate,'2026-01-31');assert.equal(r.daysOverdue,29);assert.equal(r.risk,'mild')
})
test('due date is not overdue and future and corrected payments are excluded by caller',()=>{
 const r=calculate({asOfDate:'2026-01-31',payments:[{id:'future',date:'2026-02-01',principalMinor:'200',interestMinor:'40',unappliedMinor:'0'}]})
 assert.equal(r.daysOverdue,0);assert.equal(r.risk,'smooth');assert.equal(r.rows[0].principalPaidMinor,'0')
})
test('unmatched amounts are explicit and incomplete histories cannot claim a risk',()=>{
 const r=calculate({historyComplete:false,pendingReceipts:1,payments:[{id:'a',date:'2026-02-01',principalMinor:'250',interestMinor:'60',unappliedMinor:'0'}]})
 assert.equal(r.unmatchedPrincipalMinor,'50');assert.equal(r.unmatchedInterestMinor,'20');assert.equal(r.risk,'unknown');assert.equal(r.noPaymentSixMonths,null)
})
test('distinguishes long overdue from six calendar months without a payment',()=>{
 const base={rows:[{dueDate:'2026-01-01',principalMinor:'100',interestMinor:'0'}],asOfDate:'2026-09-01',coverageStart:'2026-01-01'}
 assert.equal(calculate({...base,payments:[]}).risk,'very-risky')
 const r=calculate({...base,payments:[{id:'partial',date:'2026-08-01',principalMinor:'1',interestMinor:'0',unappliedMinor:'0'}]})
 assert.equal(r.risk,'review');assert.equal(r.noPaymentSixMonths,false)
})
test('risk boundaries and calendar-month anniversary are exact',()=>{
 const first={rows:[{dueDate:'2026-01-01',principalMinor:'1',interestMinor:'0'}],coverageStart:'2026-01-01'}
 assert.equal(calculate({...first,asOfDate:'2026-04-01'}).risk,'mild')
 assert.equal(calculate({...first,asOfDate:'2026-04-02'}).risk,'risky')
 assert.equal(calculate({...first,asOfDate:'2026-06-30'}).risk,'risky')
 assert.equal(calculate({...first,asOfDate:'2026-07-01'}).noPaymentSixMonths,false)
 assert.equal(calculate({...first,asOfDate:'2026-07-02'}).noPaymentSixMonths,true)
})

test('fully paid plans do not report six-month nonpayment',()=>{const r=calculate({asOfDate:'2026-12-01',payments:[{id:'paid',date:'2026-01-02',principalMinor:'200',interestMinor:'40',unappliedMinor:'0'}]});assert.equal(r.risk,'smooth');assert.equal(r.noPaymentSixMonths,false)})

test('a receipt held entirely unapplied does not reset the no-payment clock',()=>{const r=calculate({rows:[{dueDate:'2026-01-01',principalMinor:'100',interestMinor:'0'}],coverageStart:'2026-01-01',asOfDate:'2026-09-01',payments:[{id:'excess',date:'2026-08-01',principalMinor:'0',interestMinor:'0',unappliedMinor:'50'}]});assert.equal(r.risk,'very-risky');assert.equal(r.noPaymentSixMonths,true);assert.equal(r.unappliedMinor,'50')})
test('reviewed pre-opening payment dates start the no-payment clock',()=>{const first={rows:[{dueDate:'2026-01-01',principalMinor:'1',interestMinor:'0'}],coverageStart:'2026-03-01',asOfDate:'2026-09-01',lastPaymentBeforeCoverage:'2026-02-01',noPaymentAnchor:'2025-01-01'};const r=calculate(first);assert.equal(r.risk,'very-risky');assert.equal(r.lastPaymentDate,'2026-02-01')})
test('tracking cannot report a baseline payment after the selected as-of date',()=>{assert.throws(()=>calculate({coverageStart:'2026-03-01',asOfDate:'2026-02-01',lastPaymentBeforeCoverage:'2026-02-15',noPaymentAnchor:'2025-01-01'}),/coverage/i)})
test('a future installment with six months without payment meets the protocol risk threshold',()=>{const r=calculate({rows:[{dueDate:'2026-12-01',principalMinor:'100',interestMinor:'0'}],coverageStart:'2026-01-01',asOfDate:'2026-11-01'});assert.equal(r.daysOverdue,0);assert.equal(r.noPaymentSixMonths,true);assert.equal(r.risk,'very-risky')})
test('recently overdue installments with six months without payment meet the protocol risk threshold',()=>{const r=calculate({rows:[{dueDate:'2026-10-15',principalMinor:'100',interestMinor:'0'}],coverageStart:'2026-01-01',asOfDate:'2026-11-01'});assert.equal(r.daysOverdue,17);assert.equal(r.noPaymentSixMonths,true);assert.equal(r.risk,'very-risky')})

test('six-calendar-month threshold clamps month ends, including leap years', () => {
 const scenario = (coverageStart:string, asOfDate:string) => calculate({rows:[{dueDate:coverageStart,principalMinor:'100',interestMinor:'0'}], coverageStart, asOfDate})
 assert.equal(scenario('2024-08-31','2025-02-28').noPaymentSixMonths,false)
 assert.equal(scenario('2024-08-31','2025-03-01').noPaymentSixMonths,true)
 assert.equal(scenario('2023-08-31','2024-02-29').noPaymentSixMonths,false)
 assert.equal(scenario('2023-08-31','2024-03-01').noPaymentSixMonths,true)
})

test('payment exactly six months ago is not past the no-payment threshold', () => {
 const base = {rows:[{dueDate:'2026-01-01',principalMinor:'100',interestMinor:'0'}],coverageStart:'2026-01-01',payments:[{id:'partial',date:'2026-02-28',principalMinor:'1',interestMinor:'0',unappliedMinor:'0'}]}
 assert.equal(calculate({...base,asOfDate:'2026-08-28'}).noPaymentSixMonths,false)
 assert.equal(calculate({...base,asOfDate:'2026-08-29'}).noPaymentSixMonths,true)
})

test('out-of-order partial payments retain their own installment allocations and overdue status',()=>{
 const result=calculate({asOfDate:'2026-03-05',payments:[
  {id:'second',date:'2026-02-20',principalMinor:'70',interestMinor:'25',unappliedMinor:'0',journalId:'j2'},
  {id:'first',date:'2026-02-10',principalMinor:'40',interestMinor:'10',unappliedMinor:'0',journalId:'j1'},
 ]})
 assert.deepEqual(result.rows.map(r=>[r.principalPaidMinor,r.interestPaidMinor,r.principalRemainingMinor,r.interestRemainingMinor]),[['100','20','0','0'],['10','15','90','5']])
 assert.deepEqual(result.rows[0].allocations.map(a=>[a.repaymentId,a.journalId,a.principalMinor,a.interestMinor]),[['first','j1','40','10'],['second','j2','60','10']])
 assert.deepEqual(result.rows[1].allocations.map(a=>[a.repaymentId,a.journalId,a.principalMinor,a.interestMinor]),[['second','j2','10','15']])
 assert.equal(result.oldestUnpaidDueDate,'2026-02-28');assert.equal(result.daysOverdue,5);assert.equal(result.risk,'mild')
})
