import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readdirSync } from 'node:fs'
import { adminTools, memberTools, searchTools } from '../../src/lib/portal-navigation.ts'

test('tool search keeps every signed-in route discoverable', () => {
  const excluded = new Set(['__root', 'index', 'login', 'forgot-password', 'reset-password', 'accept-invitation'])
  const routes = readdirSync(new URL('../../src/routes/', import.meta.url)).filter(name => name.endsWith('.tsx')).map(name => name.slice(0, -4)).filter(name => !excluded.has(name))
  const advertised = new Set([...adminTools, ...memberTools].map(tool => tool.href.split('#')[0].slice(1)))
  assert.deepEqual(routes.filter(route => !advertised.has(route)).sort(), [])
})

test('search returns role-appropriate matches and does not show admin-only tools to members', () => {
  assert.ok(searchTools('admin', 'repayment').some(tool => tool.href === '/repayment-posting'))
  assert.equal(searchTools('member', 'repayment').some(tool => tool.href === '/repayment-posting'), false)
  assert.ok(searchTools('member', 'share').some(tool => tool.href === '/my-holdings'))
  assert.equal(searchTools('admin', 'not-a-real-tool').length, 0)
})
