import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { betterAuth } from 'better-auth'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { createRecoveryDelivery } from '../../src/lib/recovery-delivery.ts'
import { recoveryAuthSettings } from '../../src/lib/recovery-auth.ts'

test('password recovery uses a single-use token, revokes sessions and does not enumerate accounts', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('migrations/0001_auth.sql', 'utf8'))
  const now = Date.now(), oldHash = await hashPassword('old-password-12345')
  db.prepare('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,?,?,?)').run('user', 'Test', 'member@example.test', 0, now, now)
  db.prepare('INSERT INTO "account" (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)').run('account', 'user', 'credential', 'user', oldHash, now, now)
  db.prepare('INSERT INTO "session" (id,"expiresAt",token,"createdAt","updatedAt","userId") VALUES (?,?,?,?,?,?)').run('session', now + 3600000, 'existing-session', now, now, 'user')
  let message = ''
  const pending: Promise<unknown>[] = []
  const delivery = createRecoveryDelivery({ PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', RESEND_API_KEY: 're_example_test_key' }, 'https://investments.fidexa.org', async (_url, options) => { message = (JSON.parse(String(options?.body)) as {text: string}).text; return new Response('{"id":"test"}', {status: 200}) })
  const auth = betterAuth({ database: db, baseURL: 'https://investments.fidexa.org', secret: '0123456789abcdef0123456789abcdef', emailAndPassword: recoveryAuthSettings(delivery, p => pending.push(p)), rateLimit: { enabled: false } })
  const post = (path: string, body: unknown) => auth.handler(new Request(`https://investments.fidexa.org/api/auth/${path}`, { method: 'POST', headers: { origin: 'https://investments.fidexa.org', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const known = await post('request-password-reset', { email: 'member@example.test' })
  const unknown = await post('request-password-reset', { email: 'missing@example.test' })
  assert.equal(known.status, 200)
  assert.deepEqual(await known.json(), await unknown.json())
  await Promise.all(pending)
  const token = message.match(/\/reset-password#([A-Za-z0-9]{24})/)?.[1]
  assert.ok(token)
  assert.notEqual((await post('reset-password', { token, newPassword: 'short' })).status, 200)
  assert.equal((db.prepare('SELECT count(*) AS n FROM "verification"').get() as { n: number }).n, 1, 'a rejected password must not consume the token')
  const reset = await post('reset-password', { token, newPassword: 'new-password-12345' })
  assert.equal(reset.status, 200)
  assert.equal((db.prepare('SELECT count(*) AS n FROM "session" WHERE "userId"=?').get('user') as { n: number }).n, 0)
  const row = db.prepare('SELECT password FROM "account" WHERE "userId"=?').get('user') as { password: string }
  assert.equal(await verifyPassword({ hash: row.password, password: 'new-password-12345' }), true)
  assert.notEqual((await post('reset-password', { token, newPassword: 'another-password-12345' })).status, 200)
  db.close()
})

test('unconfigured recovery does not generate reset tokens', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('migrations/0001_auth.sql', 'utf8'))
  const auth = betterAuth({ database: db, baseURL: 'https://investments.fidexa.org', secret: '0123456789abcdef0123456789abcdef', emailAndPassword: recoveryAuthSettings(null, () => {}), rateLimit: { enabled: false } })
  const response = await auth.handler(new Request('https://investments.fidexa.org/api/auth/request-password-reset', { method: 'POST', headers: { origin: 'https://investments.fidexa.org', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'member@example.test' }) }))
  assert.notEqual(response.status, 200)
  assert.equal((db.prepare('SELECT count(*) AS n FROM "verification"').get() as { n: number }).n, 0)
  db.close()
})
