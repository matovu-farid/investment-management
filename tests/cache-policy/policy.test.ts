import { test } from 'node:test'
import assert from 'node:assert/strict'
import { secureDynamicResponse } from '../../src/server/cache-policy.ts'

test('dynamic responses are private and preserve status, body, cookies and other headers', async () => {
  const original = new Response('private content', {status: 201, headers: {'Cache-Control':'public, max-age=3600', 'Set-Cookie':'session=secret; HttpOnly', 'Content-Type':'text/plain', 'Vary':'Origin'}})
  const result = secureDynamicResponse(original)
  assert.equal(result.status,201)
  assert.equal(result.headers.get('Cache-Control'),'private, no-store')
  assert.equal(result.headers.get('Set-Cookie'),'session=secret; HttpOnly')
  assert.equal(result.headers.get('Vary'),'Origin')
  assert.equal(await result.text(),'private content')
})
test('redirect and error responses retain their status and location while disallowing storage', () => {
  for (const status of [302, 403, 500]) {
    const response = secureDynamicResponse(new Response(null,{status,headers:{Location:'/login'}}))
    assert.equal(response.status,status)
    assert.equal(response.headers.get('Location'),'/login')
    assert.equal(response.headers.get('Cache-Control'),'private, no-store')
  }
})
