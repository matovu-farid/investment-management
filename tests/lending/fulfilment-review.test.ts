import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {fulfilmentReviewError} from '../../src/lib/fulfilment-review.ts'
const booking={memberId:'m',currency:'UGX',requestedMinor:100,fulfilledMinor:10}
const loan={id:'l',memberId:'m',currency:'UGX',principalMinor:80,disbursementDate:'2026-01-02',voidedAt:null}
const records=[{loanId:'l',amountMinor:50,voidedAt:null},{loanId:'l',amountMinor:20,voidedAt:'2026-02-01'}]
test('checks selected loan date and remaining principal before retaining a request',()=>{
 assert.match(fulfilmentReviewError({booking,loan,loanSelected:true,amountMinor:1,fulfilmentDate:'2026-01-01',fulfilments:records})!,/date/i)
 assert.match(fulfilmentReviewError({booking,loan,loanSelected:true,amountMinor:31,fulfilmentDate:'2026-01-03',fulfilments:records})!,/principal/i)
 assert.equal(fulfilmentReviewError({booking,loan,loanSelected:true,amountMinor:30,fulfilmentDate:'2026-01-03',fulfilments:records}),null)
 assert.match(fulfilmentReviewError({booking,loan:null,loanSelected:true,amountMinor:1,fulfilmentDate:'2026-01-03',fulfilments:records})!,/loan/i)
 assert.equal(fulfilmentReviewError({booking,loan:null,loanSelected:false,amountMinor:90,fulfilmentDate:'2026-01-03',fulfilments:records}),null)
 assert.match(fulfilmentReviewError({booking,loan:null,loanSelected:false,amountMinor:91,fulfilmentDate:'2026-01-03',fulfilments:records})!,/booking/i)
})
