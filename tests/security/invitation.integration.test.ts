import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { fromCrossJSON, toJSONAsync } from 'seroval'

// Creates synthetic records. Run only with a disposable localhost Worker and D1 state.
const origin = process.env.RNIG_AUTH_TEST_ORIGIN
const adminEmail = process.env.RNIG_AUTH_TEST_EMAIL
const adminPassword = process.env.RNIG_AUTH_TEST_PASSWORD

test('local invitation creates a linked account and cannot be claimed twice', { skip: !origin }, async () => {
  const base = new URL(origin!)
  assert.equal(base.hostname, 'localhost')
  assert.equal(base.protocol, 'http:')
  assert.equal(base.pathname, '/')
  assert.ok(adminEmail && adminPassword, 'supply local test administrator credentials')
  const headers = { 'content-type': 'application/json', origin: base.origin }
  async function signIn(email: string, password: string) {
    const response = await fetch(`${base.origin}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email, password }) })
    assert.equal(response.status, 200)
    return response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  }
  async function functionId(module: string, name: string) {
    const response = await fetch(`${base.origin}/src/server/${module}/functions.ts`)
    assert.equal(response.status, 200, 'run against the local Vite development server')
    const source = await response.text()
    const found = source.match(new RegExp(`export const ${name}[^\\n]*createClientRpc\\("([^\\"]+)"\\)`))?.[1]
    assert.ok(found, `${name} must be present in the local module`)
    return found
  }
  async function invoke(id: string, data: unknown, cookie = '') {
    const response = await fetch(`${base.origin}/_serverFn/${id}`, {
      method: 'POST', headers: { ...headers, 'x-tsr-serverFn': 'true', accept: 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(await toJSONAsync({ data })),
    })
    assert.equal(response.status, 200)
    return fromCrossJSON(await response.json() as never, {}) as { result?: any; error?: unknown }
  }
  const [createId, issueId, claimId, portfolioId] = await Promise.all([
    functionId('members', 'createMemberFn'), functionId('invitations', 'issueInvitationFn'),
    functionId('invitations', 'claimInvitationFn'), functionId('portal', 'myPortfolioFn'),
  ])
  const adminCookie = await signIn(adminEmail!, adminPassword!)
  const suffix = randomUUID()
  const memberNumber = `INT-${suffix.slice(0, 8)}`
  const memberName = 'Synthetic Invitation Member'
  const memberEmail = `${suffix}@rnig.example`
  const memberPassword = `Local-${randomUUID()}!`
  const created = await invoke(createId, { memberNumber, fullName: memberName }, adminCookie)
  assert.ok(created.result?.id, 'local member was created')
  const issued = await invoke(issueId, { memberId: created.result.id, expectedMemberName: memberName, expectedMemberNumber: memberNumber, email: memberEmail }, adminCookie)
  assert.match(issued.result?.token, /^[0-9a-f]{64}$/)
  const claim = await invoke(claimId, { token: issued.result.token, password: memberPassword })
  assert.equal(claim.result?.success, true)
  const memberCookie = await signIn(memberEmail, memberPassword)
  // Portfolio is a GET server function; an empty POST is not equivalent.
  const portfolioResponse = await fetch(`${base.origin}/_serverFn/${portfolioId}`, { headers: { cookie: memberCookie, origin: base.origin, 'x-tsr-serverFn': 'true', accept: 'application/json' } })
  assert.equal(portfolioResponse.status, 200)
  const portfolio = fromCrossJSON(await portfolioResponse.json() as never, {}) as { result?: { status?: string; portfolio?: { member?: { id?: string } } } }
  assert.equal(portfolio.result?.status, 'linked')
  assert.equal(portfolio.result?.portfolio?.member?.id, created.result.id)
  const repeated = await fetch(`${base.origin}/_serverFn/${claimId}`, {
    method: 'POST', headers: { ...headers, 'x-tsr-serverFn': 'true', accept: 'application/json' },
    body: JSON.stringify(await toJSONAsync({ data: { token: issued.result.token, password: memberPassword } })),
  })
  assert.match(await repeated.text(), /Invitation unavailable/, 'an invitation cannot be claimed twice')
})
