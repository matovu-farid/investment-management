import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
function setup(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@a',1,1),('u','Borrower','u@a',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','001','=Borrower','a'); INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('link','u','m','a'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan','m',5000,'UGX','2020-01-01','terms','a'),('empty','m',2000,'UGX','2020-01-02','other','a'),('future','m',3000,'UGX','2021-01-01','future','a');`);const stmt=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return stmt(q,p)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args as never[]).changes)}}}});return {sql,db:{prepare:(q:string)=>stmt(q),async batch(s:{all:()=>Promise<unknown>}[]){return Promise.all(s.map(x=>x.all()))}} as unknown as D1Database}}
const key='fa5c5220-5ec2-4f62-97d0-5b72ccff4f5b'
test('dated snapshot retains all source reports and exact text with current visibility',async()=>{const {db,sql}=setup();const b=await import('../../src/server/loan-balances/service.ts');const snap=await import('../../src/server/lending-snapshot/service.ts');const {id,...preview}=(await b.listAdminLoanBalances(db,'a')).loans.find(x=>x.id==='loan')!;const v={loanId:id,preview,observedDate:'2020-02-01',amountMinor:'123456789012345678901234567890',basis:'=external',source:'GM',requestKey:key};const p=await b.publishLoanBalance(db,'a',v);await b.publishLoanBalance(db,'a',{...v,observedDate:'2020-03-01',amountMinor:'4',requestKey:'ba5c5220-5ec2-4f62-97d0-5b72ccff4f5b'});await b.withdrawLoanBalance(db,'a',{publicationId:p.id,requestKey:'aa5c5220-5ec2-4f62-97d0-5b72ccff4f5b'});const result=await snap.lendingSnapshot(db,'a',{asOf:'2020-02-29'});assert.match(result.snapshotAt,/^\d{4}-\d\d-\d\d/);assert.equal(result.loans.length,2);const loan=result.loans.find(x=>x.id==='loan')!;assert.equal(loan.principalMinor,'5000');assert.equal(loan.reports.length,1);assert.equal(loan.reports[0].amountMinor,v.amountMinor);assert.equal(loan.reports[0].visibility,'withdrawn');assert.equal(result.loans.find(x=>x.id==='empty')!.reports.length,0);assert.match(result.csv,/'123456789012345678901234567890/);assert.match(result.csv,/'=Borrower/);assert.match(result.csv,/'=external/);sql.exec("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a',revoke_request_key='rev' WHERE id='link'");const later=await snap.lendingSnapshot(db,'a',{asOf:'2020-03-31'});assert.equal(later.loans.find(x=>x.id==='loan')!.reports.find(x=>x.amountMinor==='4')!.visibility,'link_inactive');sql.close()})
test('requires administrator and valid as-of; voided loans do not appear',async()=>{const {db,sql}=setup();const s=await import('../../src/server/lending-snapshot/service.ts');await assert.rejects(s.lendingSnapshot(db,null,{asOf:'2020-01-01'}));await assert.rejects(s.lendingSnapshot(db,'u',{asOf:'2020-01-01'}));await assert.rejects(s.lendingSnapshot(db,'a',{asOf:'2020-02-30'}));sql.exec("INSERT INTO loan_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('void','loan','loan','error','void-key','a')");assert.deepEqual((await s.lendingSnapshot(db,'a',{asOf:'2020-12-31'})).loans.map(x=>x.id),['empty']);sql.close()})

test('fund observations preserve reported dates, exact amounts and current void status in snapshot and CSV',async()=>{
 const {db,sql}=setup()
 sql.exec(`INSERT INTO fund_availability_observations(id,observed_date,amount_minor,currency,basis,source,request_key,created_by) VALUES
 ('fund1','2020-02-01','123456789012345678901234567890','UGX','=unverified','Local source','f1','a'),
 ('fund2','2020-03-01','500','UGX','Cash position','Later source','f2','a');
 INSERT INTO fund_availability_voids(id,observation_id,reason,request_key,created_by) VALUES('void1','fund1','Incorrect source','v1','a');`)
 const {lendingSnapshot}=await import('../../src/server/lending-snapshot/service.ts')
 const report=await lendingSnapshot(db,'a',{asOf:'2020-02-29'})
 assert.equal(report.fundObservations.length,1)
 assert.equal(report.fundObservations[0].amountMinor,'123456789012345678901234567890')
 assert.equal(report.fundObservations[0].voidReason,'Incorrect source')
 assert.ok(report.fundObservations[0].voidedAt)
 assert.match(report.csv,/'123456789012345678901234567890/)
 assert.match(report.csv,/'=unverified/)
 assert.match(report.csv,/Incorrect source/)
 sql.close()
})

test('standalone loan balance observations include unlinked members, current voids, and exclude observations after as-of',async()=>{
 const {db,sql}=setup()
 sql.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES('unlinked','002','Unlinked borrower','a');
 INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('unlinked-loan','unlinked',1000,'UGX','2020-01-01','terms','a');
 INSERT INTO reported_loan_balances(id,loan_id,member_id,currency,disbursement_date,principal_minor,observed_date,amount_minor,basis,source,request_key,created_by) VALUES
 ('balance-1','unlinked-loan','unlinked','UGX','2020-01-01','1000','2020-02-01','90071992547409930','=Reported balance','GM spreadsheet','00000000-0000-4000-8000-000000000001','a'),
 ('balance-2','unlinked-loan','unlinked','UGX','2020-01-01','1000','2020-03-01','50','Later','GM spreadsheet','00000000-0000-4000-8000-000000000002','a');
 INSERT INTO reported_loan_balance_voids(id,observation_id,reason,request_key,created_by) VALUES('void-balance','balance-1','Wrong source','00000000-0000-4000-8000-000000000003','a');`)
 const {lendingSnapshot}=await import('../../src/server/lending-snapshot/service.ts')
 const snapshot=await lendingSnapshot(db,'a',{asOf:'2020-02-29'})
 const loan=snapshot.loans.find(l=>l.id==='unlinked-loan')!
 assert.equal(loan.observations?.length,1)
 assert.equal(loan.observations?.[0].amountMinor,'90071992547409930')
 assert.equal(loan.observations?.[0].voidReason,'Wrong source')
 assert.ok(loan.observations?.[0].voidedAt)
 assert.match(snapshot.csv,/Standalone reported loan balance observations/)
 assert.match(snapshot.csv,/'90071992547409930/)
 assert.match(snapshot.csv,/'=Reported balance/)
 assert.match(snapshot.csv,/Wrong source/)
 sql.close()
})

test('snapshot preserves imported source references and batch provenance without mislabeling member publication',async()=>{
 const {db,sql}=setup()
 const rows=[{id:'imported-observation',sourceRef:'00123',loanRef:'id:loan',loanId:'loan',memberId:'m',memberNumber:'001',memberName:'=Borrower',memberStatus:'active',currency:'UGX',principalMinor:'5000',disbursementDate:'2020-01-01',observedDate:'2020-02-01',amountMinor:'100',basis:'reported',source:'source'}]
 rows.push({...rows[0],id:'formula-observation',sourceRef:'=FORMULA'})
 sql.prepare('INSERT INTO reported_balance_import_batches(id,request_key,rows_json,created_by) VALUES(?,?,?,?)').run('batch-1','batch-key',JSON.stringify(rows),'a')
 sql.exec("INSERT INTO reported_loan_balances(id,loan_id,member_id,currency,disbursement_date,principal_minor,observed_date,amount_minor,basis,source,request_key,created_by) VALUES('manual','loan','m','UGX','2020-01-01','5000','2020-02-02','20','reported','source','manual-key','a')")
 const {lendingSnapshot}=await import('../../src/server/lending-snapshot/service.ts')
 const snapshot=await lendingSnapshot(db,'a',{asOf:'2020-02-29'})
 const observations=snapshot.loans.find(l=>l.id==='loan')!.observations!
 assert.equal(observations.find(o=>o.id==='imported-observation')!.importSourceRef,'00123')
 assert.equal(observations.find(o=>o.id==='imported-observation')!.importBatchId,'batch-1')
 assert.equal(observations.find(o=>o.id==='manual')!.importSourceRef,null)
 assert.match(snapshot.csv,/not automatically published to members/)
 assert.match(snapshot.csv,/"'00123"/)
 assert.match(snapshot.csv,/"'=FORMULA"/)
 assert.match(snapshot.csv,/batch-1/)
 sql.close()
})
