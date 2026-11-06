import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { lendingRepository } from '../../src/server/lending/repository.ts'
import { createLoan, createBooking } from '../../src/server/lending/service.ts'

test('SQLite unique keys return original records on retry and reject changed payloads', async () => {
  const db = new DatabaseSync(':memory:'); db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)")
  db.exec('PRAGMA foreign_keys=ON')
  for (const file of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0005_lending_idempotency.sql']) db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  db.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('u','Admin','admin@example.org',1,1);
    INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('u','admin','bootstrap');
    INSERT INTO members (id,member_number,full_name,created_by) VALUES ('m','1','Member','u');`)
  const adapter = { prepare(query: string) { const stmt = db.prepare(query); let values: unknown[] = []; return { bind(...v: unknown[]) { values=v; return this }, async run() { return stmt.run(...values as never[]) }, async first() { return stmt.get(...values as never[]) ?? null } } } } as unknown as D1Database
  const repo = lendingRepository(adapter)
  const loan = { idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b01', memberId:'m', principalMinor:100, currency:'UGX', disbursementDate:'2026-01-01', maturityDate:'', terms:'Agreed' }
  const booking = { idempotencyKey:'b75610af-140f-46d8-ac6c-a4be05c42b02', memberId:'m', requestedMinor:100, currency:'UGX', requestedDate:'2026-01-01' }
  const firstLoan = await createLoan(repo, 'u', loan)
  assert.equal((await createLoan(repo, 'u', loan)).id, firstLoan.id)
  await assert.rejects(createLoan(repo, 'u', {...loan, principalMinor:200}), /different loan/)
  const firstBooking = await createBooking(repo, 'u', booking)
  assert.equal((await createBooking(repo, 'u', booking)).id, firstBooking.id)
  await assert.rejects(createBooking(repo, 'u', {...booking, requestedMinor:200}), /different booking/)
  assert.equal((db.prepare('SELECT count(*) AS n FROM loans').get() as {n:number}).n, 1)
  assert.equal((db.prepare('SELECT count(*) AS n FROM credit_bookings').get() as {n:number}).n, 1)
  db.close()
})
