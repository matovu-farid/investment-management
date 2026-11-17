import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {getAcknowledgment} from '../../src/server/lending-acknowledgments/service.ts'

function setup(){
 const sql=new DatabaseSync(':memory:')
 sql.exec(`CREATE TABLE app_user_roles(user_id TEXT,role TEXT);
 CREATE TABLE members(id TEXT,member_number TEXT,full_name TEXT);
 CREATE TABLE loans(id TEXT,member_id TEXT,principal_minor INTEGER,currency TEXT,disbursement_date TEXT,reference TEXT);
 CREATE TABLE loan_repayments(id TEXT,loan_id TEXT,payment_date TEXT,amount_minor INTEGER,reference TEXT);
 CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,created_at TEXT,reason TEXT);
 CREATE TABLE journal_entries(id TEXT,effective_date TEXT,source_type TEXT,source_id TEXT,status TEXT,reverses_entry_id TEXT);
 CREATE TABLE loan_dispatch_declarations(journal_id TEXT,route TEXT);
 CREATE TABLE journal_corrections(source_kind TEXT,source_id TEXT,journal_id TEXT);
 CREATE TABLE loan_billing_events(id TEXT,repayment_id TEXT,repayment_journal_id TEXT);
 CREATE TABLE loan_openings(loan_id TEXT,journal_id TEXT,principal_minor INTEGER,opening_date TEXT,source TEXT);
 CREATE TABLE loan_opening_corrections(loan_id TEXT,original_journal_id TEXT,original_details TEXT,reason TEXT,status TEXT);
 INSERT INTO app_user_roles VALUES('admin','admin'),('member','member');
 INSERT INTO members VALUES('m1','001','Alice'),('m2','002','Bob');
 INSERT INTO loans VALUES('loan1','m1',1000,'UGX','2026-01-01','loan-ref'),('loan2','m2',2000,'UGX','2026-01-02',NULL);
 INSERT INTO loan_repayments VALUES('pay1','loan1','2026-02-01',200,'payment-ref');
 INSERT INTO loan_source_voids VALUES('loan','loan1','2026-03-01 12:00:00','incorrect loan'),('repayment','pay1','2026-03-02 12:00:00','incorrect payment');
 INSERT INTO journal_entries VALUES('original','2026-01-01','loan-disbursement','loan1','posted',NULL),('reverse','2026-04-01','reversal','original','posted','original'),('correction','2026-04-02','loan-disbursement-correction','key','posted',NULL),('reverse2','2026-12-01','source-correction-reversal','correction','posted','correction'),('other','2026-01-02','loan-disbursement','loan2','posted',NULL);
 INSERT INTO journal_corrections VALUES('loan','loan1','correction');`)
 sql.exec("INSERT INTO loan_dispatch_declarations VALUES('original','other-bank')")
 const stmt=(q:string,args:unknown[]=[])=>({bind(...values:unknown[]){return stmt(q,values)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}}})
 return {sql,db:{prepare:(q:string)=>stmt(q),async batch(s:{all:()=>Promise<unknown>}[]){return Promise.all(s.map(x=>x.all()))}} as unknown as D1Database}
}

test('only administrators can read acknowledgments, and invalid sources are rejected',async()=>{
 const {db}=setup()
 await assert.rejects(()=>getAcknowledgment(db,null,{kind:'disbursement',id:'loan1'}),/Unauthorized/)
 await assert.rejects(()=>getAcknowledgment(db,'member',{kind:'disbursement',id:'loan1'}),/Unauthorized/)
 await assert.rejects(()=>getAcknowledgment(db,'admin',{kind:'other',id:'loan1'}),/Invalid/)
 await assert.rejects(()=>getAcknowledgment(db,'admin',{kind:'disbursement',id:'missing'}),/not found/i)
})
test('disbursement acknowledgment associates the declared route only with its original journal',async()=>{
 const {db,sql}=setup()
 const result=await getAcknowledgment(db,'admin',{kind:'disbursement',id:'loan1'})
 assert.equal(result.journals.find(j=>j.journalId==='original')?.dispatchRoute,'other-bank')
 assert.equal(result.journals.find(j=>j.journalId==='correction')?.dispatchRoute,null)
 assert.equal((await getAcknowledgment(db,'admin',{kind:'disbursement',id:'loan2'})).journals[0].dispatchRoute,null)
 sql.close()
})

test('a disbursement includes only its own recorded journal versions and dated reversals',async()=>{
 const {db}=setup();const result=await getAcknowledgment(db,'admin',{kind:'disbursement',id:'loan1'})
 assert.equal(result.memberName,'Alice');assert.equal(result.memberNumber,'001');assert.equal(result.amountMinor,1000)
 assert.equal(result.voidReason,'incorrect loan');assert.equal(result.reference,'loan-ref')
 assert.deepEqual(result.journals.map(x=>[x.journalId,x.isCorrection,x.reversalId,x.reversalDate]),[['original',false,'reverse','2026-04-01'],['correction',true,'reverse2','2026-12-01']])
 assert.ok(result.capturedAt)
})

test('repayment includes both its own and its associated loan void state',async()=>{
 const {db}=setup();const result=await getAcknowledgment(db,'admin',{kind:'repayment',id:'pay1'})
 assert.equal(result.loanId,'loan1');assert.equal(result.amountMinor,200);assert.equal(result.reference,'payment-ref')
 assert.equal(result.voidReason,'incorrect payment');assert.equal(result.loanVoidReason,'incorrect loan');assert.deepEqual(result.journals,[])
})

test('repayment acknowledgment retains billing journals, reversals and reposts without mixing other receipts',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO loan_repayments VALUES('pay2','loan2','2026-02-01',300,NULL);
 INSERT INTO loan_billing_events VALUES('event1','pay1','bill1'),('event2','pay1','bill2'),('event3','pay2','bill3'),('event4','pay1','spoof');
 INSERT INTO journal_entries VALUES('bill1','2026-02-01','loan-billing-repayment','event1','posted',NULL),('bill1-reversal','2026-02-01','loan-billing-reversal','undo','posted','bill1'),('bill2','2026-02-01','loan-billing-repayment','event2','posted',NULL),('bill3','2026-02-01','loan-billing-repayment','event3','posted',NULL),('spoof','2026-02-01','loan-billing-repayment','wrong-event','posted',NULL);`)
 const result=await getAcknowledgment(db,'admin',{kind:'repayment',id:'pay1'})
 assert.deepEqual(result.journals.map(x=>[x.journalId,x.isCorrection,x.reversalId]),[['bill1',false,'bill1-reversal'],['bill2',true,null]])
 assert.deepEqual((await getAcknowledgment(db,'admin',{kind:'disbursement',id:'loan2'})).journals.map(x=>x.journalId),['other'])
 await assert.rejects(()=>getAcknowledgment(db,'member',{kind:'repayment',id:'pay1'}),/Unauthorized/)
 sql.close()
})

test('the query works against the migrated database for both source kinds',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${f}`,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','a@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','001','Alice','admin');
 INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,reference,created_by) VALUES('l','m',1000,'UGX','2026-01-01','terms','loan-ref','admin');
 INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,reference,created_by) VALUES('p','l','2026-02-01',200,'payment-ref','admin');`)
 const stmt=(q:string,args:unknown[]=[])=>({bind(...values:unknown[]){return stmt(q,values)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}}})
 const db={prepare:(q:string)=>stmt(q),async batch(s:{all:()=>Promise<unknown>}[]){return Promise.all(s.map(x=>x.all()))}} as unknown as D1Database
 assert.equal((await getAcknowledgment(db,'admin',{kind:'disbursement',id:'l'})).reference,'loan-ref')
 assert.equal((await getAcknowledgment(db,'admin',{kind:'repayment',id:'p'})).reference,'payment-ref')
})


test('opening acknowledgments show source, cutoff and correction history without crossing loans',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO loan_openings VALUES('loan1','open2',600,'2026-07-01','revised statement'),('loan2','other-opening',800,'2026-07-01','other');
 INSERT INTO loan_opening_corrections VALUES('loan1','open1','{"principalMinor":700,"openingDate":"2026-06-01","source":"old statement"}','wrong amount','final');
 INSERT INTO journal_entries VALUES('open1','2026-06-01','loan-opening','open1','posted',NULL),('open1-reverse','2026-06-01','loan-opening-reversal','correction','posted','open1'),('open2','2026-07-01','loan-opening','open2','posted',NULL),('other-opening','2026-07-01','loan-opening','other-opening','posted',NULL);`)
 const result=await getAcknowledgment(db,'admin',{kind:'disbursement',id:'loan1'})
 assert.deepEqual(result.openings.map(o=>[o.principalMinor,o.openingDate,o.source,o.correctionReason]),[[700,'2026-06-01','old statement','wrong amount'],[600,'2026-07-01','revised statement',null]])
 assert.deepEqual(result.journals.filter(j=>j.journalId.startsWith('open')).map(j=>[j.journalId,j.reversalId]),[['open1','open1-reverse'],['open2',null]])
 assert.deepEqual((await getAcknowledgment(db,'admin',{kind:'repayment',id:'pay1'})).openings,[])
})
