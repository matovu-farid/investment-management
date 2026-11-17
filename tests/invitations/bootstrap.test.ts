import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { verifyPassword } from 'better-auth/crypto'
import { bootstrapAvailable, createFirstAdmin } from '../../src/server/bootstrap/service.ts'

function fixture(existing = false) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  for (const f of ['0001_auth.sql', '0003_roles.sql']) db.exec(readFileSync(`migrations/${f}`, 'utf8'))
  if (existing) db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES ('old','Old','old@example.test',1,1)`)
  db.exec(readFileSync('migrations/0101_bootstrap.sql', 'utf8'))
  type Statement = { q: string; v: any[]; bind: (...v: any[]) => Statement; first: () => Promise<any> }
  const adapter = {
    prepare(q: string): Statement { return { q, v: [], bind(...v) { this.v = v; return this }, async first() { return db.prepare(this.q).get(...this.v) ?? null } } },
    async batch(statements: Statement[]) { db.exec('BEGIN'); try { const result = statements.map(s => ({ results: db.prepare(s.q).all(...s.v) })); db.exec('COMMIT'); return result } catch (e) { db.exec('ROLLBACK'); throw e } },
  } as unknown as D1Database
  return { db, adapter }
}
const details = { name: 'First Admin', email: 'FIRST@example.test', password: 'Long-password-2026!' }
test('first signup creates exactly one administrator with a usable Better Auth password', async () => {
  const { db, adapter } = fixture()
  assert.equal(await bootstrapAvailable(adapter), true)
  await createFirstAdmin(adapter, details, '127.0.0.1')
  assert.equal(await bootstrapAvailable(adapter), false)
  const user = db.prepare('SELECT * FROM "user"').get() as any
  const account = db.prepare('SELECT * FROM "account"').get() as any
  assert.equal(user.email, 'first@example.test')
  assert.equal(user.emailVerified, 0)
  assert.equal((db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').get(user.id) as any).role, 'admin')
  assert.equal(await verifyPassword({ hash: account.password, password: details.password }), true)
  await assert.rejects(createFirstAdmin(adapter, {...details, email: 'other@example.test'}, '127.0.0.1'))
  db.close()
})
test('existing installations and simultaneous requests cannot create a first administrator', async () => {
  const installed = fixture(true)
  installed.db.exec('DELETE FROM "user"')
  assert.equal(await bootstrapAvailable(installed.adapter), false)
  await assert.rejects(createFirstAdmin(installed.adapter, details, '127.0.0.1'))
  installed.db.close()
  const seeded = fixture()
  seeded.db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES ('seed','Seed','seed@example.test',1,1)`)
  assert.equal(await bootstrapAvailable(seeded.adapter), false)
  await assert.rejects(createFirstAdmin(seeded.adapter, details, '127.0.0.1'))
  seeded.db.exec('DELETE FROM "user"')
  assert.equal(await bootstrapAvailable(seeded.adapter), false)
  seeded.db.close()
  const { db, adapter } = fixture()
  const attempts = await Promise.allSettled([createFirstAdmin(adapter, details, '127.0.0.1'), createFirstAdmin(adapter, {...details, email: 'other@example.test'}, '127.0.0.2')])
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal((db.prepare('SELECT count(*) n FROM "user"').get() as any).n, 1)
  db.close()
})
test('bootstrap is atomic when account creation fails', async () => {
  const { db, adapter } = fixture()
  db.exec(`CREATE TRIGGER fail_account BEFORE INSERT ON "account" BEGIN SELECT RAISE(ABORT,'injected'); END`)
  await assert.rejects(createFirstAdmin(adapter, details, '127.0.0.1'))
  assert.equal(await bootstrapAvailable(adapter), true)
  assert.equal((db.prepare('SELECT count(*) n FROM "user"').get() as any).n, 0)
  db.close()
})
test('first signup validates identity and throttles repeated failures before password hashing', async () => {
  const { db, adapter } = fixture()
  await assert.rejects(createFirstAdmin(adapter, details, null))
  await assert.rejects(createFirstAdmin(adapter, {...details, password: 'short'}, '127.0.0.1'))
  await assert.rejects(createFirstAdmin(adapter, {...details, email: 'not-an-email'}, '127.0.0.1'))
  db.exec(`CREATE TRIGGER fail_account BEFORE INSERT ON "account" BEGIN SELECT RAISE(ABORT,'injected'); END`)
  for (let i = 0; i < 10; i++) await assert.rejects(createFirstAdmin(adapter, details, '127.0.0.1'))
  await assert.rejects(createFirstAdmin(adapter, details, '127.0.0.1'), /too many attempts/i)
  assert.equal((db.prepare("SELECT count FROM first_admin_rate_limits WHERE key='global'").get() as any).count, 10)
  db.close()
})
