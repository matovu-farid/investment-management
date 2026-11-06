import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {createTrade, listTrades} from '../../src/server/share-trades/service.ts'
import {createTradeRepository} from '../../src/server/share-trades/repository.ts'
const key='35551bcd-4a22-476d-831d-cfcf45f8f629'
const input={requestKey:key,saleId:'s',buyerType:'member',buyerMemberId:'b',shares:'3',tradeDate:'2026-02-03',priceMinor:'200',considerationMinor:'599',currency:'UGX',reference:'receipt',notes:''}
test('trade facts require admin and validate amount, date and buyer',async()=>{
 const repo={roleFor:async()=> 'admin',create:async(v:any)=>v,list:async()=>({members:[],sales:[],trades:[]})}
 await assert.rejects(listTrades(repo,null),/unauthorized/i);await assert.rejects(createTrade(repo,null,input),/unauthorized/i)
 assert.equal((await createTrade(repo,'admin',input)).considerationMinor,599);assert.equal((await createTrade(repo,'admin',{...input,buyerType:'group',buyerMemberId:''})).buyerMemberId,null)
 for(const patch of [{shares:'0'},{priceMinor:'1.2'},{tradeDate:'2026-02-30'},{buyerType:'member',buyerMemberId:''},{buyerType:'group',buyerMemberId:'b'},{currency:'ugx'},{requestKey:'bad'}])await assert.rejects(createTrade(repo,'admin',{...input,...patch}))
})
test('database enforces trade chronology, buyer identity, immutability and retry identity',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of ['0001_auth.sql','0001_ledger.sql','0002_domain.sql','0003_roles.sql','0015_share_sales.sql','0023_share_trades.sql','0024_trade_dates.sql','0061_trade_publications.sql','0067_share_trade_voids.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('a','1','A','admin'),('b','2','B','admin'); INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('s','a',10,200,'UGX','2026-02-01','admin','sale');")
 type S={sql:string;v:unknown[];bind:(...args:unknown[])=>S;run:()=>Promise<unknown>;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>}
 const adapter={prepare(sql:string):S{return {sql,v:[],bind(...args){this.v=args;return this},async run(){return db.prepare(this.sql).run(...this.v as never[])},async first(){return db.prepare(this.sql).get(...this.v as never[])??null},async all(){return {results:db.prepare(this.sql).all(...this.v as never[])}}}},async batch(stmts:S[]){return stmts.map(s=>({results:db.prepare(s.sql).all(...s.v as never[])}))}} as unknown as D1Database
 const repo=createTradeRepository(adapter), record={id:'t',saleId:'s',buyerType:'member' as const,buyerMemberId:'b',shares:3,tradeDate:'2026-02-03',priceMinor:200,considerationMinor:599,currency:'UGX',reference:'receipt',notes:null,createdBy:'admin'}
 assert.equal((await repo.create(record,key)).id,'t');assert.equal((await repo.create({...record,id:'t2'},key)).id,'t');await assert.rejects(repo.create({...record,shares:4},key))
 for(const [id,patch] of [['bad-date',{tradeDate:'2026-01-01'}],['self',{buyerMemberId:'a'}],['missing',{buyerMemberId:'unknown'}],['currency',{currency:'USD'}]] as const) await assert.rejects(repo.create({...record,...patch,id},id))
 const all=await repo.list('admin');assert.equal(all.trades[0].sellerName,'A');assert.equal(all.trades[0].buyerName,'B');await repo.create({...record,id:'group',buyerType:'group',buyerMemberId:null},'group-key');
 assert.throws(()=>db.exec("UPDATE share_trades SET shares=4 WHERE id='t'"));assert.throws(()=>db.exec("DELETE FROM share_trades WHERE id='t'"));assert.equal((db.prepare('SELECT count(*) AS n FROM share_events').get() as {n:number}).n,0);assert.equal((db.prepare('SELECT count(*) AS n FROM journal_entries').get() as {n:number}).n,0);db.close()
})

test('future trade migration rejects existing future facts and guards new writes',()=>{
 const db=new DatabaseSync(':memory:');for(const f of ['0001_ledger.sql','0002_domain.sql','0015_share_sales.sql','0023_share_trades.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES('a','1','A','admin'); INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('s','a',10,200,'UGX','2026-02-01','admin','sale'); INSERT INTO share_trades(id,sale_id,buyer_type,shares,trade_date,price_minor,consideration_minor,currency,created_by,request_key) VALUES('f','s','group',1,'9999-12-31',1,1,'UGX','admin','f');")
 const migration=readFileSync('migrations/0024_trade_dates.sql','utf8')
 assert.throws(()=>{db.exec('BEGIN');try{db.exec(migration);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},/CHECK/)
 db.exec('DROP TRIGGER trade_no_delete; DELETE FROM share_trades;')
 db.exec(migration)
 assert.throws(()=>db.exec("INSERT INTO share_trades(id,sale_id,buyer_type,shares,trade_date,price_minor,consideration_minor,currency,created_by,request_key) VALUES('f','s','group',1,'9999-12-31',1,1,'UGX','admin','f')"),/future/)
 db.exec("INSERT INTO share_trades(id,sale_id,buyer_type,shares,trade_date,price_minor,consideration_minor,currency,created_by,request_key) VALUES('today','s','group',1,date('now','+3 hours'),1,1,'UGX','admin','today')")
 db.close()
})
