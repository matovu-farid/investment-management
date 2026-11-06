import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0017_loan_posting.sql','0030_repayment_posting.sql','0031_journal_corrections.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m',1000,'UGX','2026-01-01','terms','u'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('asset','2','Asset','UGX'),('other','3','Other','UGX');
 INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('o','UGX','2026-01-01','old','loan-disbursement','l','u'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('a','o','asset','debit',1000),('b','o','cash','credit',1000); UPDATE journal_entries SET status='posted' WHERE id='o';
 INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES('r','UGX','2026-02-01','reverse','loan-disbursement-reversal','o','u','o'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('c','r','asset','credit',1000),('d','r','cash','debit',1000); UPDATE journal_entries SET status='posted' WHERE id='r';
 INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('fix','UGX','2026-02-02','fix','loan-disbursement-correction','k','u'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('e','fix','other','debit',1000),('f','fix','cash','credit',1000); INSERT INTO journal_corrections(id,source_kind,source_id,journal_id,predecessor_reversal_id,created_by,request_key) VALUES('c','loan','l','fix','r','u','k');`)
 return db
}
test('linked correction drafts cannot be changed to bypass correction posting checks',()=>{
 const db=fixture()
 db.exec(readFileSync('migrations/0033_correction_draft_integrity.sql','utf8'))
 // Mutation after linking must not turn this source-linked entry into another type.
 assert.throws(()=>db.exec("UPDATE journal_entries SET source_type='manual' WHERE id='fix'"),/correction/i)
 assert.throws(()=>db.exec("UPDATE journal_entries SET source_id='another' WHERE id='fix'"),/correction/i)
 db.exec("UPDATE journal_entries SET status='posted' WHERE id='fix'")
 assert.equal((db.prepare("SELECT status FROM journal_entries WHERE id='fix'").get() as {status:string}).status,'posted')
 db.close()
})


test('preexisting malformed linked draft cannot bypass guards by posting as manual',()=>{
 const db=fixture()
 // Simulate a malformed draft created before the additive migration.
 db.exec("UPDATE journal_entries SET source_type='manual' WHERE id='fix'")
 db.exec(readFileSync('migrations/0033_correction_draft_integrity.sql','utf8'))
 assert.throws(()=>db.exec("UPDATE journal_entries SET status='posted' WHERE id='fix'"),/correction/i)
 assert.equal((db.prepare("SELECT status FROM journal_entries WHERE id='fix'").get() as {status:string}).status,'draft')
 db.close()
})
