import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { matchesShareSearch } from '../../src/lib/share-register-search.ts'

test('share register search matches visible fields case-insensitively and keeps all rows when blank', () => {
  const fields = ['Walkthrough Member', '2026-11-01', 'UGX', 100, null]
  assert.equal(matchesShareSearch('  ', fields), true)
  assert.equal(matchesShareSearch('WALKTHROUGH', fields), true)
  assert.equal(matchesShareSearch('2026-11', fields), true)
  assert.equal(matchesShareSearch('100', fields), true)
  assert.equal(matchesShareSearch('unknown', fields), false)
})
