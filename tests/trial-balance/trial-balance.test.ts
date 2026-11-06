import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { trialBalance } from '../../src/server/trial-balance/service.ts'
function setup() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync('migrations/0001_ledger.sql','utf8'));sql.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin'),('member','member'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES ('a','100','Cash','UGX'),('b','200','Capital','UGX'),('c','300','Dollar','USD'),('d','400','Unused','UGX');")
 const statement=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return statement(q,p)},async all(){return {results:sql.prepare(q).all(...args as never[])}},async first(){return sql.prepare(q).get(...args as never[])??null}})
 const db={prepare:(q:string)=>statement(q),async batch(stmts:ReturnType<typeof statement>[]){return Promise.all(stmts.map(s=>s.all()))}} as unknown as D1Database
 function entry(id:string,date:string,currency:string,amount:number,status='posted',rev:string|null=null){sql.prepare("INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES(?,?,?,'test','test',?,'admin',?)").run(id,currency,date,id,rev);let a=currency==='UGX'?'a':'c',b=currency==='UGX'?'b':'c';sql.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').run(id+'1',id,a,rev?'credit':'debit',amount);sql.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').run(id+'2',id,b,rev?'debit':'credit',amount);if(status==='posted')sql.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").run(id)}
 return {db,entry}
}
test('admin as-of totals include reversals by date, exclude drafts and future, separate currencies and preserve large integers',async()=>{const {db,entry}=setup();entry('one','2026-01-01','UGX',9007199254740991);entry('two','2026-01-02','UGX',9007199254740991);entry('rev','2026-02-01','UGX',9007199254740991,'posted','one');entry('usd','2026-01-01','USD',12);entry('future','2026-03-01','UGX',4);entry('draft','2026-01-01','UGX',5,'draft');const r=await trialBalance(db,'admin','2026-01-31');const a=r.accounts.find(x=>x.code==='100')!;assert.equal(a.debits,'18014398509481982');assert.equal(a.credits,'0');assert.equal(a.netDebit,'18014398509481982');assert.equal(r.accounts.find(x=>x.code==='400')?.debits,'0');assert.equal(r.totals.find(x=>x.currency==='USD')?.debits,'12');const after=await trialBalance(db,'admin','2026-02-01');assert.equal(after.accounts.find(x=>x.code==='100')?.netDebit,'9007199254740991')})
test('requires admin and a real as-of date',async()=>{const {db}=setup();await assert.rejects(trialBalance(db,null,'2026-01-01'),/unauthorized/i);await assert.rejects(trialBalance(db,'member','2026-01-01'),/unauthorized/i);await assert.rejects(trialBalance(db,'admin','2026-02-30'),/date/i)})

test('non-admin requests do not materialize ledger rows in the database batch', async () => {
 const { db, entry } = setup(); entry('posted', '2026-01-01', 'UGX', 100)
 const base = db.batch.bind(db)
 let ledgerRows: unknown[] | undefined
 const guarded = { ...db, prepare: db.prepare.bind(db), async batch(statements: D1PreparedStatement[]) {
  const result = await base(statements)
  ledgerRows = result[1].results
  return result
 } } as D1Database
 await assert.rejects(trialBalance(guarded, 'member', '2026-01-31'), /unauthorized/i)
 assert.deepEqual(ledgerRows, [])
})
