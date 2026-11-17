import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { validateScheduleCoverage } from '../../src/lib/installment-tracking/review-validation.ts'

const rows = [{dueDate:'2026-02-01',principalMinor:'300',interestMinor:'10'}]
const opening = {openingDate:'2026-01-01',principalMinor:'700',interestDueMinor:'50'}
test('incomplete brought-forward history may cover later dates and partial obligations',()=>{
 assert.equal(validateScheduleCoverage({historyComplete:false,coverageStart:'2026-01-15',disbursementDate:'2025-01-01',originalPrincipalMinor:'1000',opening,rows}),null)
})
test('complete brought-forward history covers cutoff principal and unpaid interest',()=>{
 const input={historyComplete:true,coverageStart:'2026-01-01',disbursementDate:'2025-01-01',originalPrincipalMinor:'1000',opening,rows}
 assert.match(validateScheduleCoverage(input)!,/principal|interest/i)
 assert.equal(validateScheduleCoverage({...input,rows:[{...rows[0],principalMinor:'700',interestMinor:'50'}]}),null)
})
test('complete original-loan schedule covers original principal before review',()=>{
 const input={historyComplete:true,coverageStart:'2025-01-01',disbursementDate:'2025-01-01',originalPrincipalMinor:'1000',opening:null,rows}
 assert.match(validateScheduleCoverage(input)!,/principal/i)
 assert.equal(validateScheduleCoverage({...input,rows:[{...rows[0],principalMinor:'1000'}]}),null)
})
test('coverage and installment dates cannot precede their permitted baselines',()=>{
 const input={historyComplete:false,coverageStart:'2025-12-31',disbursementDate:'2025-01-01',originalPrincipalMinor:'1000',opening,rows}
 assert.match(validateScheduleCoverage(input)!,/coverage/i)
 assert.match(validateScheduleCoverage({...input,coverageStart:'2026-01-01',rows:[{...rows[0],dueDate:'2024-12-31'}]})!,/coverage/i)
 assert.match(validateScheduleCoverage({...input,historyComplete:true,coverageStart:'2026-01-02'})!,/coverage/i)
})
