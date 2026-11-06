import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { postJournal } from '../../src/server/accounting/posting.ts'

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON')
  for (const file of ['0001_auth.sql','0001_ledger.sql','0003_roles.sql','0012_reversal_chronology.sql']) db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  db.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('u','Admin','a@example.org',1,1); INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('u','admin','bootstrap'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES ('cash','100','Cash','UGX'),('loan','200','Loans','UGX'),('usd','300','USD','USD');`)
  type Statement = { query: string; values: unknown[]; bind: (...v: unknown[]) => Statement; first: () => Promise<unknown>; all: () => Promise<{results: unknown[]}> }
  const adapter = {
    prepare(query: string): Statement { return { query, values: [], bind(...v: unknown[]) { this.values=v; return this }, async first() { return db.prepare(this.query).get(...this.values as never[]) ?? null }, async all() { return { results: db.prepare(this.query).all(...this.values as never[]) } } } },
    async batch(statements: Statement[]) { db.exec('BEGIN'); try { for (const s of statements) db.prepare(s.query).run(...s.values as never[]); db.exec('COMMIT') } catch(e) { db.exec('ROLLBACK'); throw e } },
  } as unknown as D1Database
  return { db, adapter }
}
const input = { currency:'UGX', effectiveDate:'2026-01-01', description:'Disbursement', sourceType:'loan', sourceId:'1', lines:[{accountId:'loan',side:'debit',amountMinor:100},{accountId:'cash',side:'credit',amountMinor:100}] }

test('posts atomically and returns the same journal for identical retries', async () => {
  const {db,adapter} = fixture(); const first = await postJournal(adapter,'u',input); const retry = await postJournal(adapter,'u',input)
  assert.equal(first.id, retry.id)
  assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,1)
  await assert.rejects(postJournal(adapter,'u',{...input, description:'Changed'}), /already used/i)
  db.close()
})
test('rejects unauthorized, invalid, or wrong currency without partial journals', async () => {
  const {db,adapter} = fixture()
  await assert.rejects(postJournal(adapter,null,input), /unauthorized/i)
  await assert.rejects(postJournal(adapter,'u',{...input,lines:[input.lines[0]]}), /two/i)
  await assert.rejects(postJournal(adapter,'u',{...input,lines:[input.lines[0],{accountId:'usd',side:'credit',amountMinor:100}]}))
  assert.equal((db.prepare('SELECT count(*) n FROM journal_entries').get() as {n:number}).n,0)
  db.close()
})
test('posts an exact reversal and rejects a mismatched reversal atomically', async () => {
  const {db,adapter} = fixture(); const original=await postJournal(adapter,'u',input)
  const reversal = {...input,sourceType:'reversal',sourceId:'1',reversesEntryId:original.id,lines:[{accountId:'loan',side:'credit',amountMinor:100},{accountId:'cash',side:'debit',amountMinor:100}]}
  await assert.rejects(postJournal(adapter,'u',{...reversal,lines:[{accountId:'loan',side:'credit',amountMinor:99},{accountId:'cash',side:'debit',amountMinor:99}]}))
  await postJournal(adapter,'u',reversal)
  assert.equal((db.prepare('SELECT count(*) n FROM journal_entries WHERE status=\'posted\'').get() as {n:number}).n,2)
  db.close()
})

test('rejects a reversal dated before the original journal', async () => {
  const {db, adapter} = fixture()
  const original = await postJournal(adapter, 'u', {...input, effectiveDate:'2026-06-01'})
  await assert.rejects(postJournal(adapter, 'u', {...input, effectiveDate:'2026-01-01', sourceType:'reversal', sourceId:'early', reversesEntryId:original.id, lines:[{accountId:'loan',side:'credit',amountMinor:100},{accountId:'cash',side:'debit',amountMinor:100}]}), /before/i)
  db.close()
})
