import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'

function setup() {
  const db = new DatabaseSync(':memory:')
  for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql') && f.slice(0, 4) <= '0037').sort()) db.exec(readFileSync(`migrations/${f}`, 'utf8'))
  db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','A','a@a',1,1);
    INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap');
    INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','M','u');
    INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m',100,'UGX','2000-01-01','x','u');
    INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('r','l','2000-01-02',10,'u');
    INSERT INTO ledger_accounts(id,code,name,currency) VALUES('a','1','A','UGX'),('b','2','B','UGX');
    INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('j','UGX','2000-01-02','Loan repayment 1:r loan 1:l member 1:m','loan-repayment','r','u');
    INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('ja','j','a','debit',10),('jb','j','b','credit',10);
    UPDATE journal_entries SET status='posted' WHERE id='j';`)
  return db
}
function reversal(db:DatabaseSync,id:string,original:string,date:string,sourceType:string) {
  db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES('${id}','UGX','${date}','reversal','${sourceType}','${original}','u','${original}');
    INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('${id}a','${id}','a','credit',10),('${id}b','${id}','b','debit',10);
    UPDATE journal_entries SET status='posted' WHERE id='${id}';`)
}
const voidSql = "INSERT INTO loan_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','repayment','r','error','k','u')"
test('rejects void until the original reversal is effective in UTC',()=>{
 const db=setup(); reversal(db,'rev','j','2999-01-01','loan-repayment-reversal')
 assert.throws(()=>db.exec(voidSql),/reversal.*effective/i)
})
test('accepts a reversal effective today in UTC',()=>{
 const db=setup(); const today=(db.prepare("SELECT date('now') AS d").get() as {d:string}).d
 reversal(db,'rev','j',today,'loan-repayment-reversal'); db.exec(voidSql)
 assert.equal((db.prepare('SELECT count(*) AS n FROM loan_source_voids').get() as {n:number}).n,1)
})
test('rejects future reversal of a replacement journal even when original reversal is effective',()=>{
 const db=setup(); reversal(db,'rev','j','2000-01-03','loan-repayment-reversal')
 db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('c','UGX','2000-01-04','replacement','loan-repayment-correction','correction-key','u');
 INSERT INTO journal_corrections(id,source_kind,source_id,journal_id,predecessor_reversal_id,created_by,request_key) VALUES('link','repayment','r','c','rev','u','correction-key');
 INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('ca','c','a','debit',10),('cb','c','b','credit',10);UPDATE journal_entries SET status='posted' WHERE id='c';`)
 reversal(db,'crev','c','2999-01-01','source-correction-reversal')
 assert.throws(()=>db.exec(voidSql),/reversal.*effective/i)
})
