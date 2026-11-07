import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { betterAuth } from 'better-auth'
import { createRecoveryDelivery } from '../../src/lib/recovery-delivery.ts'
import { recoveryAuthSettings } from '../../src/lib/recovery-auth.ts'

test('a Resend outage does not reveal account existence or provider details', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('migrations/0001_auth.sql', 'utf8'))
  const now = Date.now()
  db.prepare('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,?,?,?)')
    .run('member', 'Synthetic member', 'member@example.test', 0, now, now)
  const pending: Promise<unknown>[] = []
  const delivery = createRecoveryDelivery(
    { PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', RESEND_API_KEY: 're_example_test_key' },
    'https://investments.fidexa.org',
    async () => new Response('sensitive provider error', { status: 503 }),
  )
  const auth = betterAuth({ database: db, baseURL: 'https://investments.fidexa.org', secret: '0123456789abcdef0123456789abcdef', emailAndPassword: recoveryAuthSettings(delivery, p => pending.push(p)), rateLimit: { enabled: false } })
  const request = (email: string) => auth.handler(new Request('https://investments.fidexa.org/api/auth/request-password-reset', {
    method: 'POST', headers: { origin: 'https://investments.fidexa.org', 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  }))
  const known = await request('member@example.test')
  const unknown = await request('missing@example.test')
  assert.equal(known.status, 200)
  assert.equal(unknown.status, 200)
  const knownBody = await known.text()
  assert.equal(knownBody, await unknown.text())
  assert.doesNotMatch(knownBody, /sensitive provider error|member@example|re_example_test_key/)
  await Promise.all(pending)
  db.close()
})
