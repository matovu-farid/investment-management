import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

// This writes a synthetic PDF. Use only a disposable localhost Worker, D1 and R2.
const origin = process.env.RNIG_AUTH_TEST_ORIGIN
const adminEmail = process.env.RNIG_AUTH_TEST_EMAIL
const adminPassword = process.env.RNIG_AUTH_TEST_PASSWORD
const memberEmail = process.env.RNIG_MEMBER_TEST_EMAIL
const memberPassword = process.env.RNIG_MEMBER_TEST_PASSWORD

test('private document HTTP endpoints enforce role, origin and content checks', { skip: !origin }, async () => {
  const base = new URL(origin!)
  assert.equal(base.protocol, 'http:')
  assert.equal(base.hostname, 'localhost')
  assert.equal(base.pathname, '/')
  assert.ok(adminEmail && adminPassword && memberEmail && memberPassword, 'provide isolated administrator and member credentials')
  const headers = { origin: base.origin, 'content-type': 'application/json' }
  async function signIn(email: string, password: string) {
    const result = await fetch(`${base.origin}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email, password }) })
    assert.equal(result.status, 200)
    const cookie = result.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
    assert.ok(cookie)
    return cookie
  }
  const admin = await signIn(adminEmail!, adminPassword!)
  const member = await signIn(memberEmail!, memberPassword!)
  const id = randomUUID()
  const bytes = new TextEncoder().encode('%PDF-1.4\n% synthetic test document\n%%EOF\n')
  const uploadHeaders = { 'content-type': 'application/pdf', 'x-document-id': id, 'x-document-title': 'Synthetic integration test', 'x-document-filename': 'integration.pdf' }
  const endpoint = `${base.origin}/api/documents`
  assert.equal((await fetch(endpoint)).status, 403)
  assert.equal((await fetch(endpoint, { headers: { cookie: member } })).status, 403)
  assert.equal((await fetch(`${endpoint}?id=${id}`, { headers: { cookie: member } })).status, 403)
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...uploadHeaders, cookie: admin, origin: 'https://attacker.example' }, body: bytes })).status, 403)
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...uploadHeaders, cookie: member, origin: base.origin }, body: bytes })).status, 403)
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...uploadHeaders, cookie: admin, origin: base.origin }, body: 'not a PDF' })).status, 400)
  const saved = await fetch(endpoint, { method: 'POST', headers: { ...uploadHeaders, cookie: admin, origin: base.origin }, body: bytes })
  assert.equal(saved.status, 200)
  const downloaded = await fetch(`${endpoint}?id=${id}`, { headers: { cookie: admin } })
  assert.equal(downloaded.status, 200)
  assert.match(downloaded.headers.get('content-disposition') || '', /^attachment;/)
  assert.equal(downloaded.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes)
  assert.equal((await fetch(`${endpoint}?id=${id}`, { headers: { cookie: member } })).status, 403)
})
