import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createShareEvent, createJointHolding, type SharesRepository } from '../../src/server/shares/service.ts'
function fixture(role: string | null) {
  const calls: string[] = []
  const repo: SharesRepository = { roleFor: async () => role, list: async () => ({ members: [], holdings: [], events: [] }), createEvent: async value => { calls.push('event'); return value }, createJoint: async value => { calls.push('joint'); return value } }
  return { repo, calls }
}
const event = { requestId: 'request-event', memberId: 'm1', eventType: 'opening', shares: 20, eventDate: '2026-11-05', reference: '', notes: '' }
test('only admins can record share events or joint holdings', async () => {
  for (const actor of [null, 'user']) { const { repo, calls } = fixture(null); await assert.rejects(createShareEvent(repo, actor, event), /unauthorized/i); await assert.rejects(createJointHolding(repo, actor, { requestId: 'request-joint', name: 'Joint', members: [{id:'a',memberNumber:'1',fullName:'A'},{id:'b',memberNumber:'2',fullName:'B'}] }), /unauthorized/i); assert.deepEqual(calls, []) }
})
test('validates positive integer shares, a real date and precisely one holder', async () => {
  const { repo, calls } = fixture('admin')
  for (const patch of [{ shares: 0 }, { shares: 1.5 }, { shares: Number.MAX_SAFE_INTEGER + 1 }, { eventDate: '2026-02-30' }, { memberId: '', jointHoldingId: '' }, { jointHoldingId: 'j1' }, { eventType: 'unknown' }]) await assert.rejects(createShareEvent(repo, 'u', { ...event, ...patch }), /invalid/i)
  assert.deepEqual(calls, [])
  const saved = await createShareEvent(repo, 'u', event); assert.equal(saved.createdBy, 'u'); assert.equal(saved.shares, 20)
})
test('joint holding requires distinct members', async () => {
  const { repo, calls } = fixture('admin')
  for (const members of [[], ['a'], ['a', 'a']]) await assert.rejects(createJointHolding(repo, 'u', { requestId: 'request-joint', name: 'Joint', members: members.map(id=>({id,memberNumber:id,fullName:id})) }), /invalid/i)
  assert.deepEqual(calls, [])
  const saved = await createJointHolding(repo, 'u', { requestId: 'request-joint', name: ' Joint ', members: [{id:'a',memberNumber:'1',fullName:'A'},{id:'b',memberNumber:'2',fullName:'B'}] }); assert.equal(saved.name, 'Joint')
})
