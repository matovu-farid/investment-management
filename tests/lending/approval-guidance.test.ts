import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {approvalGuidance} from '../../src/lib/approval-guidance.ts'
test('UGX approval guidance uses exact stated thresholds',()=>{
 assert.equal(approvalGuidance('UGX','50000000','2026-01-01','loan')?.authority,'gm')
 assert.equal(approvalGuidance('UGX','050000000','2026-01-01','loan')?.authority,'gm')
 assert.equal(approvalGuidance('UGX','1','2026-02-30','loan'),null)
 assert.equal(approvalGuidance('UGX','50000001','2026-01-01','loan')?.authority,'gm-and-board')
 assert.equal(approvalGuidance('UGX','300000000','2026-01-01','investment')?.externalReview,false)
 assert.equal(approvalGuidance('UGX','300000001','2026-01-01','investment')?.externalReview,true)
 assert.equal(approvalGuidance('UGX','300000001','2026-01-01','loan')?.externalReview,false)
 assert.equal(approvalGuidance('USD','50000001','2026-01-01','loan'),null)
 assert.equal(approvalGuidance('UGX','50000001','2025-09-27','loan'),null)
})
