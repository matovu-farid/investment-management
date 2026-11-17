import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { loadWorkspace } from '../../src/server/dashboard/workspace.ts'

test('workspace starts independent, guarded reads together and returns only the role-appropriate details', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started: string[] = []
  const load = loadWorkspace({ id: 'admin', name: 'Test' }, {
    overview: async () => { started.push('overview'); await gate; return { kind: 'admin' as const, counts: null } },
    funds: async () => { started.push('funds'); await gate; return { observations: [] } },
    shares: async () => { started.push('shares'); await gate; return [{ private: true }] },
  })
  assert.deepEqual(started, ['overview', 'funds', 'shares'])
  release()
  assert.deepEqual(await load, { user: { id: 'admin', name: 'Test' }, overview: { kind: 'admin', counts: null }, fundObservations: { observations: [] }, shareValues: null })
})

test('workspace suppresses unrelated and failed data without leaking it to members or unauthenticated requests', async () => {
  let calls = 0
  const deps = {
    overview: async () => { calls++; return { kind: 'member' as const } },
    funds: async () => { calls++; return { private: true } },
    shares: async () => { calls++; throw new Error('unavailable') },
  }
  assert.equal(await loadWorkspace(null, deps), null)
  assert.equal(calls, 0)
  assert.deepEqual(await loadWorkspace({ id: 'member' }, deps), { user: { id: 'member' }, overview: { kind: 'member' }, fundObservations: null, shareValues: null })
})

test('failed overview does not disclose either guarded read', async () => {
  const result = await loadWorkspace({ id: 'user' }, {
    overview: async () => { throw new Error('unavailable') },
    funds: async () => ({ private: true }),
    shares: async () => [{ private: true }],
  })
  assert.deepEqual(result, { user: { id: 'user' }, overview: null, fundObservations: null, shareValues: null })
})
