import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'

const env = { ...process.env, PROVISION_EMAIL: 'synthetic@rnig.example', PROVISION_PASSWORD: 'Synthetic-test-2026!' }
for (const args of [[], ['--remtoe'], ['--remote', '--admin'], ['--local', '--remote'], ['--local', '--unknown']]) {
  test(`provisioning rejects unsafe or ambiguous flags: ${args.join(' ') || '(none)'}`, () => {
    const result = spawnSync(process.execPath, ['scripts/provision-user.mjs', ...args], { env, encoding: 'utf8', timeout: 5000 })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /usage|local.*admin/i)
    assert.doesNotMatch(result.stdout, /wrangler/i, 'invalid flags must fail before database access')
  })
}
