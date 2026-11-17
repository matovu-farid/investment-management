import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createInvitationDelivery } from '../../src/lib/invitation-delivery.ts'

const config = { RESEND_API_KEY: 're_test_key', PASSWORD_RESET_FROM: 'noreply@fidexa.org' }
const token = 'ab'.repeat(32)

test('invitation delivery requires safe provider configuration and a trusted origin', () => {
  assert.equal(createInvitationDelivery({ ...config, RESEND_API_KEY: '' }, 'https://investments.fidexa.org'), null)
  assert.equal(createInvitationDelivery({ ...config, PASSWORD_RESET_FROM: 'invalid\nheader' }, 'https://investments.fidexa.org'), null)
  assert.equal(createInvitationDelivery(config, 'http://example.com'), null)
  assert.equal(createInvitationDelivery(config, 'https://investments.fidexa.org/path'), null)
})

test('sends the one-use fragment link to the reviewed address', async () => {
  let request: RequestInit | undefined
  const fetcher: typeof fetch = async (url, init) => { assert.equal(String(url), 'https://api.resend.com/emails'); request = init; return new Response('{}', { status: 200 }) }
  const send = createInvitationDelivery(config, 'https://investments.fidexa.org', fetcher)!
  await send({ email: 'member@example.test', token })
  assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer re_test_key')
  const body = JSON.parse(String(request?.body)) as { to: string[]; from: string; text: string }
  assert.deepEqual(body.to, ['member@example.test'])
  assert.equal(body.from, 'noreply@fidexa.org')
  assert.ok(body.text.includes(`https://investments.fidexa.org/accept-invitation#${token}`))
})

test('invalid inputs and provider failures do not expose the token or provider details', async () => {
  const fetcher: typeof fetch = async () => { throw new Error('sensitive provider details') }
  const send = createInvitationDelivery(config, 'https://investments.fidexa.org', fetcher)!
  await assert.rejects(send({ email: 'x\nother@example.test', token }))
  await assert.rejects(send({ email: 'member@example.test', token: '../invalid' }))
  await assert.rejects(send({ email: 'member@example.test', token }), error => error instanceof Error && !error.message.includes('sensitive') && !error.message.includes(token))
  for (const status of [403, 500]) {
    const fail: typeof fetch = async () => new Response('sensitive provider response', { status })
    const rejected = createInvitationDelivery(config, 'https://investments.fidexa.org', fail)!
    await assert.rejects(rejected({ email: 'member@example.test', token }), error => error instanceof Error && error.message === 'Delivery unavailable')
  }
})
