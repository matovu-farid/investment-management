import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {createSaleRepository} from '../../src/server/share-sales/repository.ts'
test('database preserves facts, retry identity and chronology',async()=>{
 const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0015_share_sales.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8')); db.exec("CREATE TABLE member_sale_interest_requests(id TEXT PRIMARY KEY); INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('a','1','A','admin'),('b','2','B','admin');")
 type S={sql:string;v:unknown[];bind:(...v:unknown[])=>S;run:()=>Promise<unknown>;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const adapter={prepare(sql:string):S{return {sql,v:[],bind(...v){this.v=v;return this},async run(){return db.prepare(this.sql).run(...this.v as never[])},async first(){return db.prepare(this.sql).get(...this.v as never[])??null},async all(){return {results:db.prepare(this.sql).all(...this.v as never[])}}}},async batch(stmts:S[]){return stmts.map(s=>({results:db.prepare(s.sql).all(...s.v as never[])}))}} as unknown as D1Database
 const repo=createSaleRepository(adapter), sale={id:'s',memberId:'a',shares:10,askingPriceMinor:200,currency:'UGX',requestDate:'2026-02-01',deadlineDate:'2026-02-28',notes:null,createdBy:'admin'}
 assert.equal((await repo.createSale(sale,'key')).id,'s'); assert.equal((await repo.createSale({...sale,id:'other'},'key')).id,'s'); await assert.rejects(repo.createSale({...sale,id:'other',shares:12},'key'))
 await assert.rejects(repo.addInterest({id:'i',saleId:'s',memberId:'b',interestDate:'2026-01-01',shares:2,notes:null,createdBy:'admin'},'i'))
 await repo.addInterest({id:'i',saleId:'s',memberId:'b',interestDate:'2026-02-02',shares:2,notes:null,createdBy:'admin'},'i')
 db.exec("INSERT INTO share_sale_interests(id,sale_id,member_id,interest_date,shares,created_by,request_key) VALUES('i2','s','b','2026-02-02',1,'member','i2')")
 db.prepare('INSERT INTO member_sale_interest_requests(id) VALUES(?)').run('i2')
 await assert.rejects(repo.addStatus({id:'bad',saleId:'s',statusDate:'2026-01-01',status:'closed',newDeadlineDate:null,notes:null,createdBy:'admin'},'bad')); await assert.rejects(repo.addInterest({id:'self',saleId:'s',memberId:'a',interestDate:'2026-02-02',shares:1,notes:null,createdBy:'admin'},'self'));
 await assert.rejects(repo.addStatus({id:'invalid-deadline',saleId:'s',statusDate:'2026-02-05',status:'extended',newDeadlineDate:'2026-02-04',notes:null,createdBy:'admin'},'invalid-deadline'));
 await repo.addStatus({id:'t',saleId:'s',statusDate:'2026-02-03',status:'announced',newDeadlineDate:null,notes:null,createdBy:'admin'},'t')
 const records=await repo.list('admin'); assert.equal(records.sales[0].memberName,'A');assert.equal(records.interests[0].memberName,'B');assert.equal(records.interests.find(i=>i.id==='i')?.provenance,'admin');assert.equal(records.interests.find(i=>i.id==='i2')?.provenance,'member'); assert.equal(records.statuses.length,1); assert.equal((db.prepare('SELECT count(*) AS n FROM share_events').get() as {n:number}).n,0);assert.equal((db.prepare('SELECT count(*) AS n FROM journal_entries').get() as {n:number}).n,0)
 assert.throws(()=>db.exec("UPDATE share_sale_requests SET shares=3 WHERE id='s'"));db.close()
})
