// Provision one user through local or remote Wrangler. Supply credentials in the
// environment; never commit the generated SQL or real credentials.
import { hashPassword } from 'better-auth/crypto'
import { randomUUID } from 'node:crypto'
import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
if (!['--local', '--remote'].includes(args[0]) || args.length > 2 || (args[1] && args[1] !== '--admin')) throw new Error('Usage: node scripts/provision-user.mjs --local [--admin] | --remote')
const mode = args[0]
const localAdmin = args[1] === '--admin'
if (localAdmin && mode !== '--local') throw new Error('The admin option is available only for local test accounts.')
const { PROVISION_EMAIL: email, PROVISION_PASSWORD: password, PROVISION_NAME: name = 'Test Member' } = process.env
if (!email || !password || password.length < 12) throw new Error('Set PROVISION_EMAIL and PROVISION_PASSWORD (at least 12 characters).')
const id = randomUUID(), accountId = randomUUID(), now = Date.now(), hash = await hashPassword(password)
const quote = value => `'${value.replaceAll("'", "''")}'`
const sql = `INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES (${quote(id)},${quote(name)},${quote(email.toLowerCase())},0,${now},${now});\nINSERT INTO "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES (${quote(accountId)},${quote(id)},'credential',${quote(id)},${quote(hash)},${now},${now});\n`
const roleSql = localAdmin ? `INSERT INTO app_user_roles (user_id, role, granted_by) VALUES (${quote(id)}, 'admin', 'local-test-bootstrap');\n` : ''
const file = join(tmpdir(), `rnig-provision-${randomUUID()}.sql`)
try {
  await writeFile(file, sql + roleSql, { mode: 0o600 })
  const persist = mode === '--local' && process.env.RNIG_LOCAL_STATE ? ['--persist-to', process.env.RNIG_LOCAL_STATE] : []
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'rnig-investments', mode, ...persist, '--file', file], { stdio: 'inherit' })
  if (result.status !== 0) process.exitCode = result.status || 1
} finally { await rm(file, { force: true }) }
