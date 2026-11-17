import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { calculateLoanBilling } from '../../src/lib/loan-billing/billing.ts'

test('effective rate applies after its date without rounding each segment separately',()=>{
 const r=calculateLoanBilling({principalMinor:'180000',disbursementDate:'2026-01-01',asOfDate:'2026-01-11',rateBasisPoints:200,periodDays:60,repayments:[],rateChanges:[{effectiveDate:'2026-01-06',rateBasisPoints:500,periodDays:180}]})
 assert.equal(r.totalInterestMinor,'550')
 assert.equal(r.minimumInterestMinor,'3600')
 assert.equal(r.settlementInterestMinor,'3600')
})

test('rate changes must be distinct and after disbursement',()=>{
 const input={principalMinor:'10000',disbursementDate:'2026-01-01',asOfDate:'2026-02-01',rateBasisPoints:200,periodDays:60 as const,repayments:[]}
 assert.throws(()=>calculateLoanBilling({...input,rateChanges:[{effectiveDate:'2026-01-01',rateBasisPoints:200,periodDays:30}]}))
 assert.throws(()=>calculateLoanBilling({...input,rateChanges:[{effectiveDate:'2026-01-02',rateBasisPoints:200,periodDays:30},{effectiveDate:'2026-01-02',rateBasisPoints:500,periodDays:180}]}))
})

const base={principalMinor:'1000000',disbursementDate:'2026-01-04',rateBasisPoints:200,periodDays:60 as const,repayments:[] as {id:string;date:string;amountMinor:string}[]}
test('initial billing on the 27th and later billing at two-calendar-month intervals',()=>{
 const r=calculateLoanBilling({...base,asOfDate:'2026-05-27'})
 assert.deepEqual(r.lines.filter(l=>l.type==='billing').map(l=>l.date),['2026-01-27','2026-03-27','2026-05-27'])
 assert.equal(r.minimumInterestMinor,'20000')
})
test('payment allocates earned interest before principal, then applies minimum on day 60',()=>{
 const r=calculateLoanBilling({...base,asOfDate:'2026-03-05',repayments:[{id:'p',date:'2026-02-03',amountMinor:'110000'}]})
 const p=r.lines.find(l=>l.type==='payment')!
 assert.equal(p.interestMinor,'10000');assert.equal(p.principalMinor,'100000')
 assert.equal(r.principalMinor,'900000');assert.equal(r.totalInterestMinor,'20000')
})
test('early settlement charges minimum once and holds excess unapplied',()=>{
 const r=calculateLoanBilling({...base,asOfDate:'2026-06-01',repayments:[{id:'p',date:'2026-01-14',amountMinor:'1100000'}]})
 const p=r.lines.find(l=>l.type==='payment')!
 assert.equal(p.interestMinor,'20000');assert.equal(p.principalMinor,'1000000');assert.equal(p.unappliedMinor,'80000')
 assert.equal(r.principalMinor,'0');assert.equal(r.totalInterestMinor,'20000');assert.equal(r.interestDueMinor,'0')
 assert.equal(r.lines.filter(l=>l.type==='minimum').length,1)
 assert.ok(!r.lines.some(l=>l.type==='billing' && l.date>'2026-01-14'))
})
test('early settlement quotation includes the remaining minimum before it is charged',()=>{
 const r=calculateLoanBilling({...base,asOfDate:'2026-01-14'})
 assert.equal(r.interestDueMinor,'3333')
 assert.equal(r.settlementInterestMinor,'20000')
 assert.equal(r.settlementTotalMinor,'1020000')
 assert.ok(!r.lines.some(l=>l.type==='minimum'))
})
test('leap-day periods use elapsed actual days while retaining the 27th',()=>{
 const r=calculateLoanBilling({...base,disbursementDate:'2028-01-28',asOfDate:'2028-03-28'})
 assert.equal(r.lines.find(l=>l.type==='billing')?.date,'2028-02-27')
 assert.equal(r.totalInterestMinor,'20000')
})
test('180-day product bills every six calendar months and prorates its 60-day minimum',()=>{
 const r=calculateLoanBilling({...base,rateBasisPoints:500,periodDays:180,asOfDate:'2026-07-27'})
 assert.deepEqual(r.lines.filter(l=>l.type==='billing').map(l=>l.date),['2026-01-27','2026-07-27'])
 assert.equal(r.minimumInterestMinor,'16667')
 assert.equal(r.totalInterestMinor,'56667')
})
test('event lines reconcile all recognized charges and allocations',()=>{
 const r=calculateLoanBilling({...base,asOfDate:'2026-04-27',repayments:[{id:'p',date:'2026-02-03',amountMinor:'110000'}]})
 const sum=(v:string[])=>v.reduce((a,b)=>a+BigInt(b),0n)
 assert.equal(sum(r.lines.filter(l=>l.type!=='payment').map(l=>l.interestMinor)),BigInt(r.totalInterestMinor))
 assert.equal(sum(r.lines.filter(l=>l.type==='payment').map(l=>l.interestMinor)),BigInt(r.interestPaidMinor))
 assert.equal(BigInt(r.totalInterestMinor)-BigInt(r.interestPaidMinor),BigInt(r.interestDueMinor))
})
test('same-day repayments use id order and dates after the 27th align to the next 27th',()=>{
 const r=calculateLoanBilling({...base,disbursementDate:'2026-01-28',asOfDate:'2026-02-27',repayments:[{id:'b',date:'2026-02-27',amountMinor:'100'},{id:'a',date:'2026-02-27',amountMinor:'100'}]})
 assert.deepEqual(r.lines.filter(l=>l.type==='payment').map(l=>l.paymentId),['a','b'])
 assert.equal(r.lines.find(l=>l.type==='billing')?.date,'2026-02-27')
})
test('rejects duplicate ids, invalid dates, negative amounts and before-disbursement payments',()=>{
 assert.throws(()=>calculateLoanBilling({...base,asOfDate:'2026-01-03'}))
 assert.throws(()=>calculateLoanBilling({...base,asOfDate:'2026-02-30'}))
 assert.throws(()=>calculateLoanBilling({...base,asOfDate:'2026-03-05',repayments:[{id:'p',date:'2026-01-03',amountMinor:'1'}]}))
 assert.throws(()=>calculateLoanBilling({...base,asOfDate:'2026-03-05',repayments:[{id:'p',date:'2026-01-05',amountMinor:'-1'}]}))
 assert.throws(()=>calculateLoanBilling({...base,asOfDate:'2026-03-05',repayments:[{id:'p',date:'2026-01-05',amountMinor:'1'},{id:'p',date:'2026-01-05',amountMinor:'1'}]}))
})
