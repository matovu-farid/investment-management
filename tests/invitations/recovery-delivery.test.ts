import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRecoveryDelivery } from '../../src/lib/recovery-delivery.ts'

const token = 'AbCdEf0123456789GhIjKlMn'
const configured = { PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', RESEND_API_KEY: 're_example_test_key' }

test('recovery requires explicit enablement, sender and Resend key', () => {
  assert.equal(createRecoveryDelivery({ ...configured, RESEND_API_KEY: '' }, 'https://investments.fidexa.org'), null)
  assert.equal(createRecoveryDelivery({ ...configured, PASSWORD_RESET_ENABLED: '' }, 'https://investments.fidexa.org'), null)
  assert.equal(createRecoveryDelivery({ ...configured, PASSWORD_RESET_FROM: 'invalid\nheader' }, 'https://investments.fidexa.org'), null)
  assert.equal(createRecoveryDelivery({ ...configured, RESEND_API_KEY: ' \n ' }, 'https://investments.fidexa.org'), null)
})

test('sends a fragment reset link through Resend with the secret in the authorization header', async () => {
  let url = '', request: RequestInit | undefined
  const fetcher: typeof fetch = async (input, init) => { url = String(input); request = init; return new Response('{"id":"test"}', { status: 200 }) }
  const delivery = createRecoveryDelivery(configured, 'https://investments.fidexa.org', fetcher)
  assert.ok(delivery)
  await delivery({ email: 'member@example.test', token })
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer re_example_test_key')
  const mail = JSON.parse(String(request?.body)) as { to: string[]; from: string; text: string }
  assert.deepEqual(mail.to, ['member@example.test'])
  assert.equal(mail.from, 'noreply@fidexa.org')
  assert.match(mail.text, new RegExp(`https://investments\\.fidexa\\.org/reset-password#${token}`))
  assert.doesNotMatch(mail.text, /\?token=/)
})

test('rejects malformed tokens, untrusted origins and provider failures without exposing details', async () => {
  const fetcher: typeof fetch = async () => new Response('sensitive provider response', { status: 403 })
  assert.equal(createRecoveryDelivery(configured, 'https://investments.fidexa.org/path', fetcher), null)
  assert.equal(createRecoveryDelivery(configured, 'http://example.com', fetcher), null)
  const delivery = createRecoveryDelivery(configured, 'https://investments.fidexa.org', fetcher)!
  await assert.rejects(delivery({ email: 'member@example.test', token: '../malformed' }))
  await assert.rejects(delivery({ email: 'member@example.test', token }), error => error instanceof Error && !error.message.includes('sensitive'))
  const failedNetwork: typeof fetch = async () => { throw new Error('secret provider connection details') }
  const unavailable = createRecoveryDelivery(configured, 'https://investments.fidexa.org', failedNetwork)!
  await assert.rejects(unavailable({ email: 'member@example.test', token }), error => error instanceof Error && !error.message.includes('secret'))
})
