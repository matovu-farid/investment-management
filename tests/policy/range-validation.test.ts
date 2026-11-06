import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validatePolicyRange } from '../../src/lib/policy-range.ts'

test('converts valid percentages exactly and permits an omitted target', () => {
  assert.deepEqual(validatePolicyRange('0.01', '100', ''), { min: '1', max: '10000', target: '' })
  assert.deepEqual(validatePolicyRange('10', '30.25', '20.50'), { min: '1000', max: '3025', target: '2050' })
})

test('explains out-of-range and inconsistent allocation percentages', () => {
  assert.throws(() => validatePolicyRange('0', '100.01', ''), /between 0 and 100/i)
  assert.throws(() => validatePolicyRange('40', '30', ''), /minimum.*maximum/i)
  assert.throws(() => validatePolicyRange('10', '30', '31'), /target.*between/i)
  assert.throws(() => validatePolicyRange('abc', '30', ''), /valid percentage/i)
})
