import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

function sql(statement: string) {
  const schema = readFileSync('migrations/0001_auth.sql', 'utf8') + '\n' + readFileSync('migrations/0003_roles.sql', 'utf8')
  return spawnSync('sqlite3', [':memory:'], { encoding: 'utf8', input: `.bail on\nPRAGMA foreign_keys=ON;\n${schema}\n${statement}` })
}
const user = `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('user-1','Jane','jane@example.org',1,1);`

test('requires explicit role grant for an existing user', () => {
  const initial = sql(`${user} SELECT count(*) FROM app_user_roles;`)
  assert.equal(initial.status, 0, initial.stderr)
  assert.equal(initial.stdout.trim(), '0')
  const granted = sql(`${user} INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('user-1','admin','bootstrap'); SELECT role FROM app_user_roles;`)
  assert.equal(granted.status, 0, granted.stderr)
  assert.equal(granted.stdout.trim(), 'admin')
  assert.notEqual(sql(`INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('missing','admin','bootstrap');`).status, 0)
  assert.notEqual(sql(`${user} INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('user-1','member','bootstrap');`).status, 0)
})
