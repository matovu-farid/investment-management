import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {createTrade,listTrades} from '../../src/server/share-trades/service.ts'
import {createTradeRepository} from '../../src/server/share-trades/repository.ts'

function fixture(mode:'write'|'read'|'confirm'|'none') {
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0015_share_sales.sql','0023_share_trades.sql','0024_trade_dates.sql','0061_trade_publications.sql','0067_share_trade_voids.sql']) db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('a','1','Seller','admin'),('b','2','Buyer','admin'); INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('s','a',10,200,'UGX','2026-02-01','admin','sale')`)
 let injected=false
 type S={sql:string;v:unknown[];bind:(...v:unknown[])=>S;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 const adapter={prepare(sql:string):S{return {sql,v:[],bind(...v){this.v=v;return this},async first(){return db.prepare(this.sql).get(...this.v as never[])??null},async all(){return {results:db.prepare(this.sql).all(...this.v as never[])}},async run(){if(mode==='write'&&!injected&&this.sql.includes('INSERT INTO share_trades')){injected=true;db.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}const result=db.prepare(this.sql).run(...this.v as never[]);if(mode==='confirm'&&!injected&&this.sql.includes('INSERT INTO share_trades')){injected=true;db.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}return result}}},async batch(stmts:S[]){if(mode==='read'&&!injected){injected=true;db.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}return stmts.map(s=>({results:db.prepare(s.sql).all(...s.v as never[])}))}} as unknown as D1Database
 return {db,repo:createTradeRepository(adapter)}
}
const input={requestKey:'35551bcd-4a22-476d-831d-cfcf45f8f629',saleId:'s',buyerType:'member',buyerMemberId:'b',shares:'3',tradeDate:'2026-02-03',priceMinor:'200',considerationMinor:'599',currency:'UGX',reference:'receipt',notes:''}
test('demotion before the write prevents recording a trade',async()=>{const {db,repo}=fixture('write');await assert.rejects(createTrade(repo,'admin',input),/unauthorized|unavailable/i);assert.equal((db.prepare('SELECT count(*) n FROM share_trades').get() as {n:number}).n,0);db.close()})
test('demotion before the read does not return sensitive trade lists',async()=>{const {db,repo}=fixture('read');await assert.rejects(listTrades(repo,'admin'),/unauthorized/i);db.close()})
test('demotion after insertion prevents returning trade data during confirmation',async()=>{const {db,repo}=fixture('confirm');await assert.rejects(createTrade(repo,'admin',input),/unauthorized|unavailable/i);assert.equal((db.prepare('SELECT count(*) n FROM share_trades').get() as {n:number}).n,1);db.close()})
