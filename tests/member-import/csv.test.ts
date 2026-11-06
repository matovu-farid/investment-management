import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseMemberCsv } from '../../src/lib/member-import/csv.ts'

test('parses quoted commas, escaped quotes, newlines and leading zero member numbers', () => {
  const result = parseMemberCsv('member_number,full_name,email\r\n001,"Ada, ""A""\nExample",ada@example.com\r\n002,Second Person,')
  assert.deepEqual(result.rows, [{ memberNumber: '001', fullName: 'Ada, "A"\nExample', email: 'ada@example.com' }, { memberNumber: '002', fullName: 'Second Person', email: null }])
  assert.deepEqual(result.errors, [])
})
test('rejects malformed CSV, wrong columns, duplicate numbers and invalid members', () => {
  assert.ok(parseMemberCsv('member_number,full_name\n001,"unclosed').errors.length)
  assert.ok(parseMemberCsv('full_name,member_number\nName,001').errors.length)
  const r = parseMemberCsv('member_number,full_name,email\n001,One,invalid\n001,,')
  assert.ok(r.errors.some(x => x.includes('email')))
  assert.ok(r.errors.some(x => x.includes('Duplicate')))
  assert.ok(r.errors.some(x => x.includes('name')))
})
test('rejects more than 100 data rows', () => {
  assert.ok(parseMemberCsv('member_number,full_name\n' + Array.from({length:101}, (_, i) => `${i},Member`).join('\n')).errors.some(x => x.includes('100')))
})
