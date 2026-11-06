import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'

// Run only against an isolated local Worker and its disposable D1 database.
// The account must be a test-only, unverified email/password account.
const origin = process.env.RNIG_AUTH_TEST_ORIGIN
const email = process.env.RNIG_AUTH_TEST_EMAIL
const password = process.env.RNIG_AUTH_TEST_PASSWORD

test('local Worker enforces invitation-only signup and email/password sessions', { skip: !origin }, async () => {
  const url = new URL(origin!)
  assert.equal(url.hostname, 'localhost', 'authentication integration test must target localhost')
  assert.equal(url.protocol, 'http:')
  assert.equal(url.pathname, '/')
  assert.ok(email && password, 'supply credentials for an isolated test account')
  const headers = { 'content-type': 'application/json', origin: url.origin }
  const signup = await fetch(`${url.origin}/api/auth/sign-up/email`, {
    method: 'POST', headers, body: JSON.stringify({ name: 'Synthetic signup', email: `${randomUUID()}@rnig.example`, password }),
  })
  assert.equal(signup.status, 400, 'public email/password registration must be disabled')
  const signupBody = await signup.json() as { code?: string }
  assert.equal(signupBody.code, 'EMAIL_PASSWORD_SIGN_UP_DISABLED')
  const failed = await fetch(`${url.origin}/api/auth/sign-in/email`, {
    method: 'POST', headers, body: JSON.stringify({ email, password: `${password}incorrect` }),
  })
  assert.equal(failed.ok, false, 'incorrect credentials must not sign in')
  const signedIn = await fetch(`${url.origin}/api/auth/sign-in/email`, {
    method: 'POST', headers, body: JSON.stringify({ email, password }),
  })
  assert.equal(signedIn.status, 200, 'test account must sign in')
  const signInBody = await signedIn.json() as { user?: { email?: string; emailVerified?: boolean } }
  assert.equal(signInBody.user?.email, email.toLowerCase())
  assert.equal(signInBody.user?.emailVerified, false, 'test account should demonstrate the temporary unverified-email setting')
  const cookies = signedIn.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  assert.ok(cookies, 'sign-in should set a session cookie')
  const session = await fetch(`${url.origin}/api/auth/get-session`, { headers: { cookie: cookies } })
  assert.equal(session.status, 200)
  const sessionBody = await session.json() as { user?: { email?: string } }
  assert.equal(sessionBody.user?.email, email.toLowerCase())
  const signout = await fetch(`${url.origin}/api/auth/sign-out`, { method: 'POST', headers: { ...headers, cookie: cookies }, body: '{}' })
  assert.equal(signout.status, 200)
  const after = await fetch(`${url.origin}/api/auth/get-session`, { headers: { cookie: cookies } })
  assert.equal(await after.json(), null, 'the original session must not survive sign-out')
})
