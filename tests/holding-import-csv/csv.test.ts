import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHoldingCsv } from '../../src/lib/holding-import/csv.ts'
const header='member_number,joint_holding_id,observed_date,shares,source\n'
test('preserves leading zeros and parses quoted commas and line breaks',()=>{
 const result=parseHoldingCsv(header+'00042,,2026-01-31,15,"Register, page 1"\n,joint-1,2026-02-01,0,"First\nsecond"')
 assert.deepEqual(result.errors,[])
 assert.deepEqual(result.rows,[{memberNumber:'00042',jointHoldingId:null,observedDate:'2026-01-31',shares:'15',source:'Register, page 1'},{memberNumber:null,jointHoldingId:'joint-1',observedDate:'2026-02-01',shares:'0',source:'First\nsecond'}])
})
test('rejects ambiguous holder, impossible date, unsafe shares and missing source',()=>{
 const result=parseHoldingCsv(header+'x,y,2026-02-30,9007199254740992,\n,,2026-01-01,01,source')
 assert.ok(result.errors.length>=5)
})
test('rejects malformed records, duplicate holders and oversized batches',()=>{
 assert.ok(parseHoldingCsv(header+'x,,2026-01-01,1,"bad').errors.length)
 assert.ok(parseHoldingCsv(header+'x,,2026-01-01,1,source\nx,,2026-01-01,2,source').errors.length)
 assert.ok(parseHoldingCsv(header+Array.from({length:101},(_,i)=>`${i},,2026-01-01,1,s`).join('\n')).errors.length)
})
test('rejects a quoted header that combines two distinct columns',()=>{
 assert.ok(parseHoldingCsv('"member_number,joint_holding_id",observed_date,shares,source\nx,,2026-01-01,1,s').errors.length)
})
