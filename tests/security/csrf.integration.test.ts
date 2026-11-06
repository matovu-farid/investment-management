import { test } from 'node:test'
import { strict as assert } from 'node:assert'

// Run against an isolated `npm run dev` Worker: RNIG_CSRF_TEST_ORIGIN=http://localhost:3010 node --experimental-strip-types --test tests/security/csrf.integration.test.ts
// The test uses the unauthenticated member mutation; its authorization guard
// prevents writes, and its "Unauthorized" result proves the request reached it.
const origin = process.env.RNIG_CSRF_TEST_ORIGIN

test('server functions reject cross-origin, same-site sibling and unverifiable requests', { skip: !origin }, async () => {
  const moduleResponse = await fetch(`${origin}/src/server/members/functions.ts`)
  assert.equal(moduleResponse.status, 200, 'run against the Vite development server')
  const moduleSource = await moduleResponse.text()
  const id = moduleSource.match(/export const createMemberFn[^\n]*createClientRpc\("([^\"]+)"\)/)?.[1]
  assert.ok(id, 'member server function must be discoverable in the dev module')
  const call = (headers: Record<string, string>) => fetch(`${origin}/_serverFn/${id}`, {
    method: 'POST', headers: { 'x-tsr-serverFn': 'true', ...headers }, body: new FormData(),
  })
  for (const headers of [
    { 'sec-fetch-site': 'same-origin' },
    { origin: origin! },
    { referer: `${origin}/members` },
  ] as Record<string, string>[]) {
    const response = await call(headers)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Unauthorized/, 'allowed request must reach the authorization guard')
  }
  for (const headers of [
    { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' },
    { 'sec-fetch-site': 'same-site', origin: 'https://sibling.example' },
    { origin: 'https://attacker.example' },
    { referer: 'https://attacker.example/' },
    {},
  ] as Record<string, string>[]) {
    const response = await call(headers)
    assert.equal(response.status, 403)
  }
  const authHealth = await fetch(`${origin}/api/auth/ok`)
  assert.equal(authHealth.status, 200, 'Better Auth routes retain their own request handling')
})
