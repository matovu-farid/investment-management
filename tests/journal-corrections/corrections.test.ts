import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

test('replacement journals require an exact posted predecessor reversal and serialize successors', () => {
 const db=new DatabaseSync(':memory:'); db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)");db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0017_loan_posting.sql','0030_repayment_posting.sql','0031_journal_corrections.sql']) db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m',1000,'UGX','2026-01-01','terms','u'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('asset','2','Asset','UGX'),('other','3','Other','UGX');`)
 function journal(id:string,type:string,source:string,date:string,rev:string|null,lines:[string,string,number][]) { db.prepare(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES(?,'UGX',?,'test',?,?,'u',?)`).run(id,date,type,source,rev); for (const [i,[account,side,amount]] of lines.entries()) db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').run(id+i,id,account,side,amount) }
 const post=(id:string)=>db.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").run(id)
 journal('original','loan-disbursement','l','2026-01-01',null,[['asset','debit',1000],['cash','credit',1000]]);post('original')
 journal('reversal','loan-disbursement-reversal','original','2026-02-01','original',[['asset','credit',1000],['cash','debit',1000]]);post('reversal')
 const link=(journalId:string,predecessor:string,key:string)=>db.prepare("INSERT INTO journal_corrections(id,source_kind,source_id,journal_id,predecessor_reversal_id,created_by,request_key) VALUES(?, 'loan', 'l', ?, ?, 'u', ?)").run(key,journalId,predecessor,key)
 journal('early','loan-disbursement-correction','k1','2026-01-31',null,[['other','debit',1000],['cash','credit',1000]]);assert.throws(()=>link('early','reversal','k1'),/date|chronolog/i)
 journal('fix','loan-disbursement-correction','k2','2026-02-02',null,[['other','debit',1000],['cash','credit',1000]]);link('fix','reversal','k2');db.exec("UPDATE journal_entries SET effective_date='2026-01-31' WHERE id='fix'");assert.throws(()=>post('fix'),/date/i);db.exec("UPDATE journal_entries SET effective_date='2026-02-02' WHERE id='fix'");post('fix')
 journal('duplicate','loan-disbursement-correction','k3','2026-02-03',null,[['other','debit',1000],['cash','credit',1000]]);assert.throws(()=>link('duplicate','reversal','k3'))
 assert.equal((db.prepare("SELECT count(*) n FROM journal_corrections").get() as {n:number}).n,1);db.close()
})

test('correction service safely retries, rejects mismatches and exposes reversal state', async () => {
 const {postCorrection,reverseCorrection,listCorrections}=await import('../../src/server/journal-corrections/service.ts')
 const db=new DatabaseSync(':memory:'); db.exec("CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)");db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0012_reversal_chronology.sql','0017_loan_posting.sql','0030_repayment_posting.sql','0031_journal_corrections.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('u','Admin','a@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','u'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('l','m',1000,'UGX','2026-01-01','terms','u'); INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','1','Cash','UGX'),('asset','2','Asset','UGX'),('other','3','Other','UGX'); INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES('o','UGX','2026-01-01','old','loan-disbursement','l','u'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('a','o','asset','debit',1000),('b','o','cash','credit',1000); UPDATE journal_entries SET status='posted' WHERE id='o'; INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES('r','UGX','2026-02-01','reverse','loan-disbursement-reversal','o','u','o'); INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES('c','r','asset','credit',1000),('d','r','cash','debit',1000); UPDATE journal_entries SET status='posted' WHERE id='r';`)
 type Stmt={query:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const adapter={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){return db.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.query).all(...this.values as never[])}}}},async batch(s:Stmt[]){db.exec('BEGIN');try{for(const x of s)db.prepare(x.query).run(...x.values as never[]);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}} as unknown as D1Database
 const data={kind:'loan',sourceId:'l',predecessorReversalId:'r',requestKey:'123e4567-e89b-42d3-a456-426614174000',date:'2026-02-02',expectedAmount:1000,expectedCurrency:'UGX',expectedMemberId:'m',debitAccountId:'other',credits:[{accountId:'cash',amountMinor:1000}]}
 db.exec("INSERT INTO ledger_accounts(id,code,name,currency) VALUES('foreign','4','Foreign','USD')")
 await assert.rejects(postCorrection(adapter,'u',{...data,requestKey:'123e4567-e89b-42d3-a456-426614174005',credits:[{accountId:'foreign',amountMinor:1000}]}),/currency/i)
 assert.equal((db.prepare("SELECT count(*) n FROM journal_corrections").get() as {n:number}).n,0)
 assert.equal((db.prepare("SELECT count(*) n FROM journal_entries WHERE source_type='loan-disbursement-correction'").get() as {n:number}).n,0)
 const a=await postCorrection(adapter,'u',data);assert.equal(a.active,true);assert.equal((await postCorrection(adapter,'u',data)).journalId,a.journalId)
 await assert.rejects(postCorrection(adapter,'u',{...data,date:'2026-02-03'}),/different/i)
 const rev={journalId:a.journalId,date:'2026-03-01',reason:'Incorrect account'};await reverseCorrection(adapter,'u',rev);assert.equal((await postCorrection(adapter,'u',data)).active,false)
 assert.equal((await listCorrections(adapter,'u','loan')).length,1)
 const originalReversal=db.prepare("SELECT id FROM journal_entries WHERE reverses_entry_id=? AND status='posted'").get(a.journalId) as {id:string}
 const next={...data,predecessorReversalId:originalReversal.id,date:'2026-03-02',requestKey:'123e4567-e89b-42d3-a456-426614174001'}
 const competing={...next,requestKey:'123e4567-e89b-42d3-a456-426614174002'}
 const results=await Promise.allSettled([postCorrection(adapter,'u',next),postCorrection(adapter,'u',competing)])
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1)
 assert.equal((db.prepare("SELECT count(*) n FROM journal_corrections").get() as {n:number}).n,2)
 await assert.rejects(postCorrection(adapter,null,next),/unauthorized/i)
 await assert.rejects(postCorrection(adapter,'u',{...next,requestKey:'123e4567-e89b-42d3-a456-426614174003',expectedAmount:1}),/changed/i)
 const {postRepayment,reverseRepayment}=await import('../../src/server/repayment-posting/service.ts')
 db.exec("INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES('receipt','l','2026-01-02',300,'u')")
 const repayment={repaymentId:'receipt',cashAccountId:'cash',credits:[{accountId:'asset',amountMinor:300}],expectedAmountMinor:300,expectedCurrency:'UGX',expectedDate:'2026-01-02',expectedLoanId:'l',expectedMemberId:'m'}
 await postRepayment(adapter,'u',repayment);const rr=await reverseRepayment(adapter,'u',{repaymentId:'receipt',effectiveDate:'2026-02-01',reason:'Correction'})
 const replacement={kind:'repayment',sourceId:'receipt',predecessorReversalId:rr.id,requestKey:'123e4567-e89b-42d3-a456-426614174004',date:'2026-02-02',expectedAmount:300,expectedCurrency:'UGX',expectedMemberId:'m',debitAccountId:'cash',credits:[{accountId:'asset',amountMinor:200},{accountId:'other',amountMinor:100}]}
 const fixed=await postCorrection(adapter,'u',replacement);assert.equal(fixed.active,true)
 await assert.rejects(postCorrection(adapter,'u',{...replacement,credits:[{accountId:'asset',amountMinor:300}]}),/different/i)
 assert.throws(()=>db.exec("UPDATE loan_repayments SET amount_minor=301 WHERE id='receipt'"),/immutable/i)
 await reverseCorrection(adapter,'u',{journalId:fixed.journalId,date:'2026-03-01',reason:'Reversed'})
 assert.equal((await postCorrection(adapter,'u',replacement)).active,false)
 db.exec("INSERT INTO loan_source_voids VALUES ('repayment','receipt','wrong receipt','2026-11-05')")
 assert.equal((await postCorrection(adapter,'u',replacement)).active,false)
 await assert.rejects(postCorrection(adapter,'u',{...replacement,expectedAmount:301}),/changed/i)
 await assert.rejects(postCorrection(adapter,'u',{...replacement,requestKey:'123e4567-e89b-42d3-a456-426614174006'}),/source changed/i)
 db.close()
})
