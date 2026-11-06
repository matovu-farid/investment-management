import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const origin = process.env.RNIG_AUTH_TEST_ORIGIN

test('server-rendered login cannot submit credentials in a URL before hydration', { skip: !origin }, async () => {
  const url = new URL(origin!)
  assert.equal(url.origin, 'http://localhost:3000')
  const response = await fetch(`${url.origin}/login`)
  assert.equal(response.status, 200)
  const html = await response.text()
  const form = html.match(/<form\b[^>]*>/i)?.[0]
  assert.ok(form, 'login form must be present')
  assert.match(form, /\bmethod="post"/i)
  const button = html.match(/<button\b[^>]*type="submit"[^>]*>/i)?.[0]
  assert.ok(button, 'submit button must be present')
  assert.match(button, /\bdisabled(?:=""|\s|>)/i)
})
