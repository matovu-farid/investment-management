import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const migration = () => readFileSync('migrations/0001_ledger.sql', 'utf8')
const setup = `
INSERT INTO ledger_accounts(id, code, name, currency) VALUES ('a','100','Cash','UGX'),('b','200','Receivable','UGX');
INSERT INTO journal_entries(id, currency, effective_date, description, source_type, source_id, created_by) VALUES ('j','UGX','2026-11-05','Loan','loan','1','user');
`
function run(sql: string) {
  return spawnSync('sqlite3', [':memory:'], { input: `.bail on\nPRAGMA foreign_keys=ON;\n${migration()}\n${setup}\n${sql}`, encoding: 'utf8' })
}
const lines = `INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES ('l1','j','a','debit',100),('l2','j','b','credit',100);`

test('posts balanced entries and prohibits alteration afterward', () => {
  assert.equal(run(`${lines} UPDATE journal_entries SET status='posted' WHERE id='j';`).status, 0)
  const changed = run(`${lines} UPDATE journal_entries SET status='posted' WHERE id='j'; DELETE FROM journal_lines WHERE id='l1';`)
  assert.notEqual(changed.status, 0)
})

test('database rejects unbalanced or empty posting and duplicate sources', () => {
  for (const sql of [
    `UPDATE journal_entries SET status='posted' WHERE id='j';`,
    `INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES ('l','j','a','debit',100); UPDATE journal_entries SET status='posted' WHERE id='j';`,
    `INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES ('j2','UGX','2026-11-05','Duplicate','loan','1','user');`,
  ]) assert.notEqual(run(sql).status, 0)
})

test('allows only exact, unique reversal of posted entries', () => {
  const reversed = `${lines} UPDATE journal_entries SET status='posted' WHERE id='j';
    INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES ('r','UGX','2026-11-05','Reverse','reversal','j','user','j');
    INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES ('r1','r','a','credit',100),('r2','r','b','debit',100);`
  assert.equal(run(`${reversed} UPDATE journal_entries SET status='posted' WHERE id='r';`).status, 0)
  assert.notEqual(run(`${reversed} UPDATE journal_lines SET amount_minor=99 WHERE id='r1'; UPDATE journal_lines SET amount_minor=99 WHERE id='r2'; UPDATE journal_entries SET status='posted' WHERE id='r';`).status, 0)
})

test('rejects a currency change that would invalidate existing draft lines', () => {
  const result = run(`${lines} UPDATE journal_entries SET currency='USD' WHERE id='j'; UPDATE journal_entries SET status='posted' WHERE id='j';`)
  assert.notEqual(result.status, 0)
})

test('rejects another reversal of the same original', () => {
  const result = run(`${lines} UPDATE journal_entries SET status='posted' WHERE id='j';
    INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES ('r','UGX','2026-11-05','Reverse','reversal','j','user','j');
    INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES ('r2','UGX','2026-11-05','Reverse again','reversal','j2','user','j');`)
  assert.notEqual(result.status, 0)
})
