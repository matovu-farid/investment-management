import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createMember, listMembers, type MemberRepository } from '../../src/server/members/service.ts'

function fixture(role: string | null) {
  const calls: string[] = []
  const repository: MemberRepository = {
    roleFor: async () => { calls.push('role'); return role },
    list: async () => { calls.push('list'); if (role !== 'admin') throw new Error('Unauthorized'); return [] },
    create: async (member) => { calls.push('create'); return member },
  }
  return { calls, repository }
}

test('unauthenticated and ungranted users cannot list or create', async () => {
  for (const actor of [null, 'ungranted']) {
    const { calls, repository } = fixture(null)
    await assert.rejects(listMembers(repository, actor), /unauthorized/i)
    await assert.rejects(createMember(repository, actor, { memberNumber: '1', fullName: 'Example' }), /unauthorized/i)
    assert.equal(calls.includes('list'), actor !== null)
    assert.equal(calls.includes('create'), false)
  }
})

test('only explicitly granted admins may access the register', async () => {
  const { repository } = fixture('member')
  await assert.rejects(listMembers(repository, 'u'), /unauthorized/i)
  const admin = fixture('admin')
  assert.deepEqual(await listMembers(admin.repository, 'u'), [])
  const saved = await createMember(admin.repository, 'u', { memberNumber: ' 001 ', fullName: ' Jane Doe ', email: ' jane@example.org ' })
  assert.equal(saved.fullName, 'Jane Doe')
  assert.equal(saved.memberNumber, '001')
  assert.equal(saved.createdBy, 'u')
})

test('rejects malformed member input before any write', async () => {
  const { calls, repository } = fixture('admin')
  for (const input of [null, {}, { memberNumber: ' ', fullName: 'Jane' }, { memberNumber: '1', fullName: 'Jane', email: 'wrong' }, { memberNumber: '1', fullName: 'x'.repeat(201) }]) {
    await assert.rejects(createMember(repository, 'u', input), /invalid/i)
  }
  assert.equal(calls.includes('create'), false)
})

test('accepts an ordinary email and rejects embedded whitespace', async () => {
  const { repository } = fixture('admin')
  const member = await createMember(repository, 'u', { memberNumber: '42', fullName: 'Jane Doe', email: 'jane.doe@example.org' })
  assert.equal(member.email, 'jane.doe@example.org')
  await assert.rejects(createMember(repository, 'u', { memberNumber: '43', fullName: 'Jane Doe', email: 'jane doe@example.org' }), /invalid/i)
})
