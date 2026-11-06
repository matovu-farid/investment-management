import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createAccount, listLedger, postManualJournal, reverseManualJournal } from '../../src/server/accounting/ledger.ts'

function fixture() {
 const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON')
 for (const file of ['0001_auth.sql','0001_ledger.sql','0003_roles.sql','0016_account_idempotency.sql']) db.exec(readFileSync(`migrations/${file}`, 'utf8'))
 db.exec(`INSERT INTO user (id,name,email,createdAt,updatedAt) VALUES ('u','Admin','a@example.test',1,1); INSERT INTO app_user_roles (user_id,role,granted_by) VALUES ('u','admin','bootstrap');`)
 const adapter = { async batch(statements: {query:string;values:unknown[]}[]) { db.exec('BEGIN'); try { const results=statements.map(s=>({results:db.prepare(s.query).all(...s.values as never[])})); db.exec('COMMIT'); return results } catch(e) { db.exec('ROLLBACK'); throw e } }, prepare(query: string) { const s = { query, values: [] as unknown[], bind(...v:unknown[]) { s.values=v; return s }, async first() { return db.prepare(query).get(...s.values as never[]) ?? null }, async all() { return {results: db.prepare(query).all(...s.values as never[])} }, async run() { return db.prepare(query).run(...s.values as never[]) } }; return s } } as unknown as D1Database
 return {db,adapter}
}
test('only admins can create or view ledger accounts', async () => {
 const {db,adapter}=fixture()
 await assert.rejects(createAccount(adapter,null,{code:'100',name:'Cash',currency:'UGX'}),/unauthorized/i)
 await assert.rejects(listLedger(adapter,null),/unauthorized/i)
 const account=await createAccount(adapter,'u',{idempotencyKey:'2996a84d-50c4-4d24-8bf2-9bddadbe95af',code:'100',name:'Cash',currency:'UGX'})
 assert.equal(account.code,'100'); assert.equal((await listLedger(adapter,'u')).accounts.length,1)
 await assert.rejects(createAccount(adapter,'u',{code:'',name:'Cash',currency:'UGX'}),/invalid/i)
 await assert.rejects(createAccount(adapter,'u',{code:'101',name:'Cash',currency:'ugx'}),/invalid/i)
 db.close()
})
test('ledger displays posted entries and their account lines, not drafts', async () => {
 const {db,adapter}=fixture(); db.exec(`INSERT INTO ledger_accounts(id,code,name,currency,created_at) VALUES ('a','100','Cash','UGX',CURRENT_TIMESTAMP),('b','200','Capital','UGX',CURRENT_TIMESTAMP); INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('p','UGX','2026-01-01','Opening','manual','one','u'),('d','UGX','2026-01-01','Draft','manual','two','u'); INSERT INTO journal_lines VALUES('l1','p','a','debit',100),('l2','p','b','credit',100); UPDATE journal_entries SET status='posted' WHERE id='p';`)
 const result=await listLedger(adapter,'u'); assert.equal(result.entries.length,1); assert.equal(result.entries[0].lines.length,2); assert.equal(result.entries[0].description,'Opening'); db.close()
})

test('manual posting requires a stable UUID and server authorization', async () => {
 const {db,adapter}=fixture()
 await assert.rejects(postManualJournal(adapter,'u',{requestId:'not-a-uuid'}),/request ID/i)
 await assert.rejects(postManualJournal(adapter,null,{requestId:'2996a84d-50c4-4d24-8bf2-9bddadbe95af'}),/unauthorized/i)
 db.close()
})

test('manual journals retain one posting on retry and isolate business source types', async () => {
 const {db,adapter}=fixture()
 db.exec(`INSERT INTO ledger_accounts(id,code,name,currency,created_at) VALUES ('a','100','Cash','UGX',CURRENT_TIMESTAMP),('b','200','Capital','UGX',CURRENT_TIMESTAMP);`)
 const input={requestId:'2996a84d-50c4-4d24-8bf2-9bddadbe95af',currency:'UGX',effectiveDate:'2026-01-01',description:'Opening',sourceType:'loan',sourceId:'forged',lines:[{accountId:'a',side:'debit',amountMinor:100},{accountId:'b',side:'credit',amountMinor:100}]}
 const first=await postManualJournal(adapter,'u',input), retry=await postManualJournal(adapter,'u',input)
 assert.equal(first.id,retry.id); assert.equal(first.sourceType,'manual'); assert.equal(first.sourceId,input.requestId)
 assert.equal((await listLedger(adapter,'u')).entries.length,1); db.close()
})
test('reverses a posted manual entry exactly and preserves the original', async () => {
 const {db,adapter}=fixture()
 db.exec(`INSERT INTO ledger_accounts(id,code,name,currency,created_at) VALUES ('a','100','Cash','UGX',CURRENT_TIMESTAMP),('b','200','Capital','UGX',CURRENT_TIMESTAMP);`)
 const original=await postManualJournal(adapter,'u',{requestId:'2996a84d-50c4-4d24-8bf2-9bddadbe95af',currency:'UGX',effectiveDate:'2026-01-01',description:'Opening',lines:[{accountId:'a',side:'debit',amountMinor:100},{accountId:'b',side:'credit',amountMinor:100}]})
 const input={requestId:'86582188-82a3-4b2e-b934-7a69d2be6da9',entryId:original.id,effectiveDate:'2026-02-01',reason:'Correction'}
 const reversal=await reverseManualJournal(adapter,'u',input)
 assert.equal(reversal.reversesEntryId,original.id); assert.equal((await reverseManualJournal(adapter,'u',input)).id,reversal.id)
 assert.deepEqual(db.prepare('SELECT account_id,side,amount_minor FROM journal_lines WHERE entry_id=? ORDER BY account_id').all(reversal.id).map(row=>({...row})),[{account_id:'a',side:'credit',amount_minor:100},{account_id:'b',side:'debit',amount_minor:100}])
 await assert.rejects(reverseManualJournal(adapter,'u',{...input,requestId:'752ccada-9bf1-461a-9847-7306eb01eaba'}),/already reversed/i)
 await assert.rejects(reverseManualJournal(adapter,null,input),/unauthorized/i)
 assert.equal((db.prepare("SELECT count(*) n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,2); db.close()
})
test('rejects reversal of a non-manual journal', async () => {
 const {db,adapter}=fixture(); db.exec(`INSERT INTO ledger_accounts(id,code,name,currency,created_at) VALUES ('a','100','Cash','UGX',CURRENT_TIMESTAMP),('b','200','Capital','UGX',CURRENT_TIMESTAMP); INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('p','UGX','2026-01-01','Loan','loan','1','u'); INSERT INTO journal_lines VALUES('l1','p','a','debit',100),('l2','p','b','credit',100); UPDATE journal_entries SET status='posted' WHERE id='p';`)
 await assert.rejects(reverseManualJournal(adapter,'u',{requestId:'86582188-82a3-4b2e-b934-7a69d2be6da9',entryId:'p',effectiveDate:'2026-02-01',reason:'Correction'}),/manual/i); db.close()
})


test('account creation retries preserve one account and reject changed details', async () => {
 const {db,adapter}=fixture()
 const input={idempotencyKey:'2996a84d-50c4-4d24-8bf2-9bddadbe95aa',code:'100',name:'Cash',currency:'UGX'}
 const first=await createAccount(adapter,'u',input), retry=await createAccount(adapter,'u',input)
 assert.equal(first.id,retry.id)
 await assert.rejects(createAccount(adapter,'u',{...input,name:'Different'}),/different/i)
 assert.equal((db.prepare('SELECT COUNT(*) n FROM ledger_accounts').get() as {n:number}).n,1)
 db.close()
})

test('lost response followed by reload retries accounts, journals and reversals without duplicates', async () => {
 const { createPendingStore } = await import('../../src/lib/pending-requests/store.ts')
 const values=new Map<string,string>(), storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}}
 const {db,adapter}=fixture()
 const accountInput={idempotencyKey:'2996a84d-50c4-4d24-8bf2-9bddadbe95aa',code:'100',name:'Cash',currency:'UGX'}
 createPendingStore(storage,'u','account').begin(accountInput)
 const account=await createAccount(adapter,'u',accountInput)
 const reloadedAccount=createPendingStore<typeof accountInput>(storage,'u','account')
 assert.equal((await createAccount(adapter,'u',reloadedAccount.read())).id,account.id)
 reloadedAccount.confirm(accountInput.idempotencyKey)
 const other=await createAccount(adapter,'u',{idempotencyKey:'2996a84d-50c4-4d24-8bf2-9bddadbe95ab',code:'200',name:'Capital',currency:'UGX'})
 const journal={idempotencyKey:'2996a84d-50c4-4d24-8bf2-9bddadbe95ac',currency:'UGX',effectiveDate:'2026-01-01',description:'Opening',lines:[{accountId:account.id,side:'debit',amountMinor:100},{accountId:other.id,side:'credit',amountMinor:100}]}
 const post=(x:typeof journal)=>postManualJournal(adapter,'u',{...x,requestId:x.idempotencyKey})
 createPendingStore(storage,'u','manual-journal').begin(journal)
 const entry=await post(journal)
 const reloadedJournal=createPendingStore<typeof journal>(storage,'u','manual-journal')
 assert.equal((await post(reloadedJournal.read()!)).id,entry.id)
 reloadedJournal.confirm(journal.idempotencyKey)
 const reversal={idempotencyKey:'2996a84d-50c4-4d24-8bf2-9bddadbe95ad',entryId:entry.id,effectiveDate:'2026-02-01',reason:'Correction'}
 const reverse=(x:typeof reversal)=>reverseManualJournal(adapter,'u',{...x,requestId:x.idempotencyKey})
 createPendingStore(storage,'u','manual-reversal').begin(reversal)
 const reversed=await reverse(reversal)
 const reloadedReversal=createPendingStore<typeof reversal>(storage,'u','manual-reversal')
 assert.equal((await reverse(reloadedReversal.read()!)).id,reversed.id)
 reloadedReversal.confirm(reversal.idempotencyKey)
 assert.equal((db.prepare('SELECT COUNT(*) n FROM ledger_accounts').get() as {n:number}).n,2)
 assert.equal((db.prepare("SELECT COUNT(*) n FROM journal_entries WHERE status='posted'").get() as {n:number}).n,2)
 db.close()
})
