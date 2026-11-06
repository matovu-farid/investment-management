import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {submitMemberInterest,listMemberInterests,publishAnnouncement,withdrawAnnouncement} from '../../src/server/announcements/service.ts'

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0011_member_links.sql','0015_share_sales.sql','0018_announcements.sql','0019_announcement_closure.sql','0021_announcement_extensions.sql','0026_member_interest.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES ('a','Admin','a@test.example',1,1),('m','Member','m@test.example',1,1),('s','Seller','s@test.example',1,1),('u','Other','u@test.example',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES('seller','1','Secret Seller','a'),('buyer','2','Buyer','a'),('other','3','Other','a');
 INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('lm','m','buyer','a'),('ls','s','seller','a'),('lu','u','other','a');
 INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,notes,created_by,request_key) VALUES('sale','seller',10,200,'UGX','2020-01-01','secret','a','sale-key');`)
 type Stmt={sql:string;values:unknown[];bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<{meta:{changes:number}}>}
 const adapter={prepare(sql:string):Stmt{return {sql,values:[],bind(...v){this.values=v;return this},async first(){return db.prepare(this.sql).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.sql).all(...this.values as never[])}},async run(){const r=db.prepare(this.sql).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}}}}}} as unknown as D1Database
 return {db,adapter}
}
const pub={saleId:'sale',expectedRequestDate:'2020-01-01',expectedShares:10,expectedPriceMinor:200,expectedCurrency:'UGX',expectedDeadlineDate:null,requestKey:'11111111-1111-4111-8111-111111111111'}
const req={announcementId:'',shares:'3',requestKey:'22222222-2222-4222-8222-222222222222'}
test('member interest is server dated, visible to admin and only to its member, and retry survives withdrawal',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub);const data={...req,announcementId:notice.id}
 const first=await submitMemberInterest(adapter,'m',data);assert.deepEqual(await submitMemberInterest(adapter,'m',data),first)
 assert.equal(first.shares,3);assert.equal(first.interestDate,(db.prepare("SELECT date('now','+3 hours') AS d").get() as {d:string}).d)
 assert.deepEqual(await listMemberInterests(adapter,'m'),[first]);assert.deepEqual(await listMemberInterests(adapter,'u'),[])
 const stored=db.prepare('SELECT member_id,shares,created_by FROM share_sale_interests').get();assert.deepEqual({...stored},{member_id:'buyer',shares:3,created_by:'m'})
 assert.equal(JSON.stringify(first).includes('seller'),false)
 await withdrawAnnouncement(adapter,'a',{announcementId:notice.id,requestKey:'33333333-3333-4333-8333-333333333333'})
 assert.deepEqual(await submitMemberInterest(adapter,'m',data),first)
 await assert.rejects(submitMemberInterest(adapter,'m',{...data,shares:'4'}),/Interest could not be recorded/)
 await assert.rejects(submitMemberInterest(adapter,'m',{...data,requestKey:'44444444-4444-4444-8444-444444444444'}),/Interest could not be recorded/)
 db.close()
})
test('seller, inactive, revoked, unauthenticated and invalid requests do not record interest',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub);const data={...req,announcementId:notice.id}
 for(const actor of [null,'s'])await assert.rejects(submitMemberInterest(adapter,actor,data),/Interest could not be recorded/)
 for(const shares of ['0','-1','1.5','9007199254740992'])await assert.rejects(submitMemberInterest(adapter,'m',{...data,shares}),/Interest could not be recorded/)
 db.prepare("UPDATE members SET status='inactive' WHERE id='buyer'").run();await assert.rejects(submitMemberInterest(adapter,'m',data),/Interest could not be recorded/)
 db.prepare("UPDATE members SET status='active' WHERE id='buyer'").run();db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='lm'").run();await assert.rejects(submitMemberInterest(adapter,'m',data),/Interest could not be recorded/)
 assert.equal((db.prepare('SELECT count(*) AS n FROM share_sale_interests').get() as {n:number}).n,0);db.close()
})
test('database rechecks the active link and notice atomically at insertion',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub);const data={...req,announcementId:notice.id}
 const original=adapter.prepare.bind(adapter);let revoked=false
 const raced={prepare(sql:string){
  if(sql.startsWith('INSERT INTO member_sale_interest_requests')&&!revoked){revoked=true;db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='lm'").run()}
  return original(sql)
 }} as unknown as D1Database
 await assert.rejects(submitMemberInterest(raced,'m',data),/Interest could not be recorded/)
 assert.equal((db.prepare('SELECT count(*) AS n FROM share_sale_interests').get() as {n:number}).n,0)
 assert.throws(()=>db.prepare("INSERT INTO member_sale_interest_requests(id,announcement_id,member_id,actor_id,shares,request_key) VALUES('bad',?,'seller','s',1,'bad-key')").run(notice.id),/interest unavailable/)
 db.close()
})
test('request-key reuse by another member or after a relink does not expose another record',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub);const data={...req,announcementId:notice.id}
 await submitMemberInterest(adapter,'m',data)
 await assert.rejects(submitMemberInterest(adapter,'u',data),/Interest could not be recorded/)
 db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='lm'").run()
 db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='lu'").run()
 db.prepare("INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('new-link','m','other','a')").run()
 assert.deepEqual(await listMemberInterests(adapter,'m'),[])
 await assert.rejects(submitMemberInterest(adapter,'m',data),/Interest could not be recorded/)
 assert.equal((db.prepare('SELECT count(*) AS n FROM share_sale_interests').get() as {n:number}).n,1)
 db.close()
})
test('interest history follows a member to their replacement account without exposing it to others',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub);const data={...req,announcementId:notice.id}
 const first=await submitMemberInterest(adapter,'m',data)
 db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='lm'").run()
 db.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES (\'replacement\',\'Replacement\',\'replacement@test.example\',1,1)').run()
 db.prepare("INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('replacement-link','replacement','buyer','a')").run()
 assert.deepEqual(await listMemberInterests(adapter,'replacement'),[first])
 assert.deepEqual(await listMemberInterests(adapter,'u'),[])
 await assert.rejects(listMemberInterests(adapter,'m'),/Unauthorized/)
 await assert.rejects(submitMemberInterest(adapter,'replacement',data),/Interest could not be recorded/)
 db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='replacement-link'").run()
 await assert.rejects(listMemberInterests(adapter,'replacement'),/Unauthorized/)
 db.close()
})
