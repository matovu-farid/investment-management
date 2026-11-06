import test from 'node:test'
import assert from 'node:assert/strict'
import {parseBookingCsv} from '../../src/lib/booking-import/csv.ts'

const header='source_ref,member_number,requested_minor,currency,requested_date,status,notes\n'
test('preserves source identifiers and quoted notes',()=>{
 const result=parseBookingCsv(header+'B001,00017,100000,UGX,2026-01-02,waiting,"Needs, funds\nsoon"')
 assert.deepEqual(result.errors,[])
 assert.deepEqual(result.rows,[{sourceRef:'B001',memberNumber:'00017',requestedMinor:'100000',currency:'UGX',requestedDate:'2026-01-02',status:'waiting',notes:'Needs, funds\nsoon'}])
})
test('rejects invalid dates, values, status, duplicates, and malformed CSV',()=>{
 assert.ok(parseBookingCsv(header+'B,1,0,UGX,2026-02-30,unknown,\nB,2,9007199254740992,xx,2026-01-01,held,').errors.length>=5)
 assert.ok(parseBookingCsv(header+'B,1,1,UGX,2026-01-01,waiting,"unfinished').errors.length)
 assert.ok(parseBookingCsv(header+Array.from({length:101},(_,i)=>`B${i},1,1,UGX,2026-01-01,waiting,`).join('\n')).errors.length)
})
