import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {compareProposedCredit} from '../../src/lib/credit-capacity-proposal.ts'

test('compares a proposed loan with the reviewed limit using exact minor units',()=>{
 assert.deepEqual(compareProposedCredit({limitMinor:'1000',exposureMinor:'600',proposalMinor:'300'}),{projectedExposureMinor:'900',remainingMinor:'100',excessMinor:'0'})
 assert.deepEqual(compareProposedCredit({limitMinor:'1000',exposureMinor:'600',proposalMinor:'500'}),{projectedExposureMinor:'1100',remainingMinor:'0',excessMinor:'100'})
 assert.deepEqual(compareProposedCredit({limitMinor:'1000',exposureMinor:'1100',proposalMinor:'50'}),{projectedExposureMinor:'1150',remainingMinor:'0',excessMinor:'150'})
 assert.deepEqual(compareProposedCredit({limitMinor:'9007199254740993',exposureMinor:'9007199254740992',proposalMinor:'2'}),{projectedExposureMinor:'9007199254740994',remainingMinor:'0',excessMinor:'1'})
})
test('requires complete coverage and a positive whole-unit proposal',()=>{
 assert.throws(()=>compareProposedCredit({limitMinor:'100',exposureMinor:'20',proposalMinor:'0'}),/positive/i)
 assert.throws(()=>compareProposedCredit({limitMinor:'100',exposureMinor:'20',proposalMinor:'1.5'}),/positive/i)
 assert.throws(()=>compareProposedCredit({limitMinor:'100',exposureMinor:'20',proposalMinor:'9007199254740992'}),/limit/i)
 assert.throws(()=>compareProposedCredit({limitMinor:'100',exposureMinor:'20',proposalMinor:'1',coverageComplete:false}),/coverage/i)
})
test('independent director illustration applies the stated UGX 5 million limit',async()=>{
 const {compareDirectorCredit}=await import('../../src/lib/credit-capacity-proposal.ts')
 assert.deepEqual(compareDirectorCredit({currency:'UGX',asOf:'2026-01-01',exposureMinor:'4000000'}),{limitMinor:'5000000',projectedExposureMinor:'4000000',remainingMinor:'1000000',excessMinor:'0'})
 assert.deepEqual(compareDirectorCredit({currency:'UGX',asOf:'2026-01-01',exposureMinor:'4000000',proposalMinor:'1500000'}),{limitMinor:'5000000',projectedExposureMinor:'5500000',remainingMinor:'0',excessMinor:'500000'})
 assert.throws(()=>compareDirectorCredit({currency:'USD',asOf:'2026-01-01',exposureMinor:'1'}),/UGX/)
 assert.throws(()=>compareDirectorCredit({currency:'UGX',asOf:'2025-09-27',exposureMinor:'1'}),/date/i)
 assert.throws(()=>compareDirectorCredit({currency:'UGX',asOf:'2026-02-30',exposureMinor:'1'}),/date/i)
 assert.throws(()=>compareDirectorCredit({currency:'UGX',asOf:'2026-01-01',exposureMinor:'1',coverageComplete:false}),/coverage/i)
})
