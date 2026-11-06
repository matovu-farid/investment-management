import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { describeInvestmentPosting } from '../../src/lib/investment-posting-status.ts'
const original = { journalId:'one', journalDate:'2026-01-01', isCorrection:0, reversalId:'rev-one', reversalDate:'2026-03-01', hasSuccessor:1 }
const replacement = { journalId:'two', journalDate:'2026-03-02', isCorrection:1, reversalId:null, reversalDate:null, hasSuccessor:0 }
const snapshot = { journalId:'one', reversalId:'rev-one', reversalDate:'2026-03-01' }
test('shows the current replacement instead of labeling the whole transaction reversed', () => {
  assert.equal(describeInvestmentPosting(snapshot, [original,replacement], '2026-04-01'), 'Replacement journal two posted · effective 2026-03-02')
})
test('indicates a future reversal and future replacement without claiming either is effective', () => {
  assert.equal(describeInvestmentPosting(snapshot, [original,replacement], '2026-02-01'), 'Replacement journal two scheduled · effective 2026-03-02')
  assert.equal(describeInvestmentPosting(snapshot, [{...original,hasSuccessor:0}], '2026-02-01'), 'Original journal one posted · reversal scheduled for 2026-03-01')
})
test('shows unknown status when independently loaded source and history disagree', () => {
  assert.match(describeInvestmentPosting({...snapshot,reversalId:null,reversalDate:null}, [original,replacement], '2026-04-01'), /changed while loading/)
  assert.match(describeInvestmentPosting(snapshot, [], '2026-04-01'), /changed while loading/)
})
