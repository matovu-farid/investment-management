import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { loadLoginState } from '../../src/server/bootstrap/login-state.ts'

test('login checks session and setup concurrently and reports configured recovery', async () => {
  const started: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const pending = loadLoginState({
    session: async () => { started.push('session'); await gate; return false },
    bootstrap: async () => { started.push('bootstrap'); await gate; return true },
    recovery: true,
  })
  assert.deepEqual(started, ['session', 'bootstrap'])
  release()
  assert.deepEqual(await pending, { signedIn: false, bootstrap: true, recovery: true })
})

test('login redirects signed-in users without exposing a signup form', async () => {
  assert.deepEqual(await loadLoginState({ session: async () => true, bootstrap: async () => true, recovery: false }),
    { signedIn: true, bootstrap: false, recovery: false })
})

test('setup lookup failure closes setup while preserving sign-in and redirects', async () => {
  const unavailable = async (): Promise<boolean> => { throw new Error('database unavailable') }
  assert.deepEqual(await loadLoginState({ session: async () => false, bootstrap: unavailable, recovery: true }),
    { signedIn: false, bootstrap: false, recovery: true })
  assert.deepEqual(await loadLoginState({ session: async () => true, bootstrap: unavailable, recovery: false }),
    { signedIn: true, bootstrap: false, recovery: false })
})
