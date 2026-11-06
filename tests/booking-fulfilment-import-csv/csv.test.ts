import test from 'node:test'
import assert from 'node:assert/strict'
import {parseBookingFulfilmentCsv} from '../../src/lib/booking-fulfilment-import/csv.ts'
const header='source_ref,booking_ref,amount_minor,fulfilment_date\n'
test('preserves reference text, quoted fields and exact amounts',()=>{
 const r=parseBookingFulfilmentCsv(header+'"PAY,001",00023,100000,2026-01-02')
 assert.deepEqual(r.errors,[])
 assert.deepEqual(r.rows,[{sourceRef:'PAY,001',bookingRef:'00023',amountMinor:'100000',fulfilmentDate:'2026-01-02'}])
})
test('rejects duplicates, malformed CSV, invalid amount/date and excessive batches',()=>{
 assert.ok(parseBookingFulfilmentCsv(header+'P,B,0,2026-02-30\nP,B,9007199254740992,2026-01-01').errors.length>=4)
 assert.ok(parseBookingFulfilmentCsv(header+'"P,B,1,2026-01-01').errors.length)
 assert.ok(parseBookingFulfilmentCsv(header+Array.from({length:101},(_,i)=>`P${i},B,1,2026-01-01`).join('\n')).errors.length)
})
