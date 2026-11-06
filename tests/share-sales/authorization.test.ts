import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {createSale,addInterest,addStatus,listSales} from '../../src/server/share-sales/service.ts'
import {createSaleRepository} from '../../src/server/share-sales/repository.ts'

function fixture(table:string|'read'){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0015_share_sales.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`CREATE TABLE member_sale_interest_requests(id TEXT PRIMARY KEY); INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('a','1','Seller','admin'),('b','2','Buyer','admin'); INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('s','a',10,200,'UGX','2026-02-01','admin','existing')`)
 let injected=false
 type S={sql:string;v:unknown[];bind:(...v:unknown[])=>S;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 const adapter={prepare(sql:string):S{return {sql,v:[],bind(...v){this.v=v;return this},async first(){return db.prepare(this.sql).get(...this.v as never[])??null},async all(){return {results:db.prepare(this.sql).all(...this.v as never[])}},async run(){if(!injected&&this.sql.includes(`INSERT INTO ${table}`)){injected=true;db.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}return db.prepare(this.sql).run(...this.v as never[])}}},async batch(stmts:S[]){if(table==='read'&&!injected){injected=true;db.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}return stmts.map(s=>({results:db.prepare(s.sql).all(...s.v as never[])}))}} as unknown as D1Database
 return {db,repo:createSaleRepository(adapter)}
}
const key='35551bcd-4a22-476d-831d-cfcf45f8f629'
test('demotion before creating a sale prevents insertion',async()=>{const {db,repo}=fixture('share_sale_requests');await assert.rejects(createSale(repo,'admin',{requestKey:key,memberId:'a',shares:'2',askingPriceMinor:'200',currency:'UGX',requestDate:'2026-02-01'}),/unauthorized|unavailable/i);assert.equal((db.prepare('SELECT count(*) n FROM share_sale_requests').get() as {n:number}).n,1);db.close()})
test('demotion before recording interest prevents insertion',async()=>{const {db,repo}=fixture('share_sale_interests');await assert.rejects(addInterest(repo,'admin',{requestKey:key,saleId:'s',memberId:'b',shares:'2',interestDate:'2026-02-02'}),/unauthorized|unavailable/i);assert.equal((db.prepare('SELECT count(*) n FROM share_sale_interests').get() as {n:number}).n,0);db.close()})
test('demotion before recording sale status prevents insertion',async()=>{const {db,repo}=fixture('share_sale_status_events');await assert.rejects(addStatus(repo,'admin',{requestKey:key,saleId:'s',status:'closed',statusDate:'2026-02-02'}),/unauthorized|unavailable/i);assert.equal((db.prepare('SELECT count(*) n FROM share_sale_status_events').get() as {n:number}).n,0);db.close()})
test('demotion before list read prevents disclosure',async()=>{const {db,repo}=fixture('read');await assert.rejects(listSales(repo,'admin'),/unauthorized/i);db.close()})
