import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRecoveryDelivery } from '../../src/lib/recovery-delivery.ts'

const token = 'AbCdEf0123456789GhIjKlMn'

test('recovery is unavailable unless explicitly enabled with a sender and email binding', () => {
  const send = async () => ({ messageId: 'test' })
  assert.equal(createRecoveryDelivery({ PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org' }, 'https://investments.fidexa.org'), null)
  assert.equal(createRecoveryDelivery({ EMAIL: { send }, PASSWORD_RESET_FROM: 'noreply@fidexa.org' }, 'https://investments.fidexa.org'), null)
  assert.equal(createRecoveryDelivery({ EMAIL: { send }, PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'invalid\nheader' }, 'https://investments.fidexa.org'), null)
})

test('sends a reset link with a fragment on the configured origin', async () => {
  let message: unknown
  const delivery = createRecoveryDelivery({ PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', EMAIL: { send: async (data) => { message = data; return { messageId: 'test' } } } }, 'https://investments.fidexa.org')
  assert.ok(delivery)
  await delivery({ email: 'member@example.test', token })
  const mail = message as { to: string; from: string; text: string }
  assert.equal(mail.to, 'member@example.test')
  assert.equal(mail.from, 'noreply@fidexa.org')
  assert.match(mail.text, new RegExp(`https://investments\\.fidexa\\.org/reset-password#${token}`))
  assert.doesNotMatch(mail.text, /\?token=/)
})

test('rejects malformed tokens and untrusted application origins', async () => {
  const send = async () => ({ messageId: 'test' })
  assert.equal(createRecoveryDelivery({ PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', EMAIL: { send } }, 'https://investments.fidexa.org/path'), null)
  assert.equal(createRecoveryDelivery({ PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', EMAIL: { send } }, 'http://example.com'), null)
  const delivery = createRecoveryDelivery({ PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_FROM: 'noreply@fidexa.org', EMAIL: { send } }, 'https://investments.fidexa.org')!
  await assert.rejects(delivery({ email: 'member@example.test', token: '../malformed' }))
})
