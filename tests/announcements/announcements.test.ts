import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { publishAnnouncement, withdrawAnnouncement, listMemberAnnouncements, listAdminAnnouncements, listPublishableExtensions, listPublishedExtensions, publishExtension } from '../../src/server/announcements/service.ts'

function fixture(applyClosure = true) {
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
 for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0011_member_links.sql','0015_share_sales.sql','0018_announcements.sql']) db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('a','Admin','a@example.test',1,1),('m','Viewer','m@example.test',1,1),('other','Unlinked','o@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES ('a','admin','bootstrap');
 INSERT INTO members(id,member_number,full_name,created_by) VALUES ('seller','1','SECRET SELLER','a'),('viewer','2','Viewer Member','a');
 INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES ('link','m','viewer','a');
 INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,deadline_date,notes,created_by,request_key) VALUES ('sale','seller',10,200,'UGX','2026-01-01','2026-03-01','PRIVATE NOTES','a','original');`)
 type Stmt={query:string,values:unknown[],bind:(...v:unknown[])=>Stmt,first:()=>Promise<unknown>,all:()=>Promise<{results:unknown[]}>,run:()=>Promise<{meta:{changes:number}}>}
 const adapter={prepare(query:string):Stmt{return {query,values:[],bind(...v){this.values=v;return this},async first(){return db.prepare(this.query).get(...this.values as never[])??null},async all(){return {results:db.prepare(this.query).all(...this.values as never[])}},async run(){const result=db.prepare(this.query).run(...this.values as never[]);return {meta:{changes:Number(result.changes)}}}}}} as unknown as D1Database
 if(applyClosure) db.exec(readFileSync('migrations/0019_announcement_closure.sql','utf8'))
 if(applyClosure) db.exec(readFileSync('migrations/0021_announcement_extensions.sql','utf8'))
 return {db,adapter}
}
const pub={saleId:'sale',expectedRequestDate:'2026-01-01',expectedShares:10,expectedPriceMinor:200,expectedCurrency:'UGX',expectedDeadlineDate:'2026-03-01',requestKey:'11111111-1111-4111-8111-111111111111'}
test('admin explicitly publishes and active linked member sees only anonymous fields',async()=>{
 const {db,adapter}=fixture();assert.deepEqual(await listMemberAnnouncements(adapter,'m'),[])
 await assert.rejects(publishAnnouncement(adapter,'m',pub),/unauthorized/i)
 const first=await publishAnnouncement(adapter,'a',pub);const retry=await publishAnnouncement(adapter,'a',pub);assert.equal(first.id,retry.id)
 const result=await listMemberAnnouncements(adapter,'m');assert.equal(result.length,1)
 assert.deepEqual(Object.keys(result[0]).sort(),['announcementId','askingPriceMinor','currency','deadlineDate','publishedAt','shares','extensions'].sort())
 const serialized=JSON.stringify(result);for(const secret of ['SECRET SELLER','seller','PRIVATE NOTES','sale','a@example']) assert.equal(serialized.includes(secret),false)
 await assert.rejects(listMemberAnnouncements(adapter,null),/unauthorized/i);await assert.rejects(listMemberAnnouncements(adapter,'other'),/unauthorized/i)
 db.prepare("UPDATE members SET status='inactive' WHERE id='viewer'").run();await assert.rejects(listMemberAnnouncements(adapter,'m'),/unauthorized/i)
 db.close()
})

test('only explicitly published eligible extensions appear anonymously and retries remain safe',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub)
 db.exec(`INSERT INTO share_sale_status_events(id,sale_id,status_date,status,new_deadline_date,notes,created_by,request_key) VALUES
 ('e1','sale','2026-02-01','extended','2026-04-01','SECRET NOTES','a','e1-key'),
 ('e2','sale','2026-02-02','extended','2026-05-01','SECRET NOTES','a','e2-key'),
 ('empty','sale','2026-02-03','extended',NULL,NULL,'a','empty-key'),
 ('future','sale',date('now','+3 hours','+1 day'),'extended',date('now','+3 hours','+2 days'),NULL,'a','future-key')`)
 const input={announcementId:notice.id,eventId:'e1',requestKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
 assert.deepEqual((await listMemberAnnouncements(adapter,'m'))[0].extensions,[])
 await assert.rejects(publishExtension(adapter,'m',input),/unauthorized/i)
 await assert.rejects(publishExtension(adapter,'a',{...input,eventId:'empty'}))
 await assert.rejects(publishExtension(adapter,'a',{...input,eventId:'future'}))
 await assert.rejects(listPublishableExtensions(adapter,'m'),/unauthorized/i)
 await assert.rejects(listPublishedExtensions(adapter,'m'),/unauthorized/i)
 assert.deepEqual((await listPublishableExtensions(adapter,'a')).map(e=>e.eventId),['e1','e2'])
 const first=await publishExtension(adapter,'a',input)
 assert.deepEqual(await publishExtension(adapter,'a',input),first)
 await assert.rejects(publishExtension(adapter,'a',{...input,eventId:'e2'}),/different/i)
 const view=await listMemberAnnouncements(adapter,'m')
 assert.deepEqual(view[0].extensions,[{eventDate:'2026-02-01',deadlineDate:'2026-04-01'}])
 assert.deepEqual((await listPublishableExtensions(adapter,'a')).map(e=>e.eventId),['e2'])
 assert.equal((await listPublishedExtensions(adapter,'a'))[0].deadlineDate,'2026-04-01')
 assert.equal(JSON.stringify(view).includes('SECRET'),false)
 assert.throws(()=>db.exec('DELETE FROM share_sale_announcement_extensions'),/immutable/i)
 await withdrawAnnouncement(adapter,'a',{announcementId:notice.id,requestKey:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})
 await assert.rejects(publishExtension(adapter,'a',{...input,eventId:'e2',requestKey:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}))
 assert.deepEqual(await listMemberAnnouncements(adapter,'m'),[])
 db.close()
})
test('explicit withdrawal hides an announcement and an identical retry is safe',async()=>{
 const {db,adapter}=fixture();const p=await publishAnnouncement(adapter,'a',pub)
 const input={announcementId:p.id,requestKey:'22222222-2222-4222-8222-222222222222'}
 await assert.rejects(withdrawAnnouncement(adapter,'m',input),/unauthorized/i)
 await withdrawAnnouncement(adapter,'a',input);await withdrawAnnouncement(adapter,'a',input)
 assert.deepEqual(await listMemberAnnouncements(adapter,'m'),[])
 await assert.rejects(withdrawAnnouncement(adapter,'a',{...input,requestKey:'33333333-3333-4333-8333-333333333333'}),/withdraw/i)
 assert.equal((await listAdminAnnouncements(adapter,'a')).length,1)
 db.close()
})

test('publication keys cannot be reused across sales or actors and withdrawal permits an explicit later republication',async()=>{
 const {db,adapter}=fixture()
 db.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('a2','Second Admin','a2@example.test',1,1);
 INSERT INTO app_user_roles(user_id,role,granted_by) VALUES ('a2','admin','bootstrap');
 INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,notes,created_by,request_key) VALUES ('sale2','seller',7,300,'UGX','2026-01-02','PRIVATE','a','request2')`)
 const first=await publishAnnouncement(adapter,'a',pub)
 await assert.rejects(publishAnnouncement(adapter,'a2',pub),/different/i)
 await assert.rejects(publishAnnouncement(adapter,'a',{...pub,saleId:'sale2'}),/different/i)
 await assert.rejects(publishAnnouncement(adapter,'a',{...pub,requestKey:'44444444-4444-4444-8444-444444444444'}))
 await withdrawAnnouncement(adapter,'a',{announcementId:first.id,requestKey:'22222222-2222-4222-8222-222222222222'})
 const again=await publishAnnouncement(adapter,'a',{...pub,requestKey:'55555555-5555-4555-8555-555555555555'})
 assert.notEqual(first.id,again.id);assert.equal((await listMemberAnnouncements(adapter,'m')).length,1)
 db.prepare("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a' WHERE id='link'").run()
 await assert.rejects(listMemberAnnouncements(adapter,'m'),/unauthorized/i)
 db.close()
})

test('recording closure immediately withdraws a notice and prevents republication',async()=>{
 const {db,adapter}=fixture()
 await publishAnnouncement(adapter,'a',pub)
 db.prepare("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,created_by,request_key) VALUES ('close','sale','2026-02-01','closed','a','closed-key')").run()
 assert.deepEqual(await listMemberAnnouncements(adapter,'m'),[])
 const row=db.prepare("SELECT withdrawn_at AS withdrawnAt FROM share_sale_announcements WHERE sale_id='sale'").get() as {withdrawnAt:string|null}
 assert.ok(row.withdrawnAt)
 assert.equal((await publishAnnouncement(adapter,'a',pub)).active,false)
 await assert.rejects(publishAnnouncement(adapter,'a',{...pub,requestKey:'66666666-6666-4666-8666-666666666666'}),/closed|cancel/i)
 db.close()
})

test('a recorded cancellation prevents a later publication and rejects future-dated completed actions',async()=>{
 const {db,adapter}=fixture()
 assert.throws(()=>db.prepare("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,created_by,request_key) VALUES ('future','sale',date('now','+3 hours','+1 day'),'cancelled','a','future-key')").run(),/future/i)
 db.prepare("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,created_by,request_key) VALUES ('cancel','sale','2026-02-01','cancelled','a','cancel-key')").run()
 await assert.rejects(publishAnnouncement(adapter,'a',pub),/closed|cancel/i)
 assert.deepEqual(await listMemberAnnouncements(adapter,'m'),[])
 db.close()
})


test('legacy closure is reconciled and future closure blocks migration',async()=>{
 const {db,adapter}=fixture(false);await publishAnnouncement(adapter,'a',pub)
 db.prepare("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,created_by,request_key) VALUES ('legacy','sale','2026-02-01','closed','a','legacy-key')").run()
 db.exec(readFileSync('migrations/0019_announcement_closure.sql','utf8'))
 db.exec(readFileSync('migrations/0021_announcement_extensions.sql','utf8'))
 assert.deepEqual(await listMemberAnnouncements(adapter,'m'),[])
 assert.ok((db.prepare("SELECT withdrawn_at FROM share_sale_announcements WHERE sale_id='sale'").get() as {withdrawn_at:string|null}).withdrawn_at)
 db.close()
 const other=fixture(false);other.db.prepare("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,created_by,request_key) VALUES ('future','sale',date('now','+3 hours','+1 day'),'closed','a','future-key')").run()
 assert.throws(()=>other.db.exec(readFileSync('migrations/0019_announcement_closure.sql','utf8')),/CHECK constraint/i)
 other.db.close()
})

test('closure and withdrawal are one atomic statement and Kampala midnight uses UTC+03',async()=>{
 const {db,adapter}=fixture();await publishAnnouncement(adapter,'a',pub)
 assert.throws(()=>db.prepare("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,created_by,request_key) VALUES ('bad','sale','2026-02-01','closed','missing-user','bad-key')").run(),/foreign key/i)
 assert.equal((db.prepare("SELECT count(*) AS n FROM share_sale_status_events WHERE id='bad'").get() as {n:number}).n,0)
 assert.equal((await listMemberAnnouncements(adapter,'m')).length,1)
 assert.equal((db.prepare("SELECT date('2026-01-01 20:59:59','+3 hours') AS d").get() as {d:string}).d,'2026-01-01')
 assert.equal((db.prepare("SELECT date('2026-01-01 21:00:00','+3 hours') AS d").get() as {d:string}).d,'2026-01-02')
 db.close()
})


test('stale review and administrator demotion cannot publish or withdraw',async()=>{
 const {db,adapter}=fixture();await assert.rejects(publishAnnouncement(adapter,'a',{...pub,expectedPriceMinor:201}),/review|changed/i)
 const prepare=adapter.prepare.bind(adapter);let demoted=false
 const race={prepare(sql:string){if(sql.startsWith('INSERT INTO share_sale_announcements')&&!demoted){demoted=true;db.prepare("DELETE FROM app_user_roles WHERE user_id='a'").run()}return prepare(sql)}} as D1Database
 await assert.rejects(publishAnnouncement(race,'a',pub));assert.equal((db.prepare('SELECT count(*) AS n FROM share_sale_announcements').get() as {n:number}).n,0)
 db.prepare("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','bootstrap')").run();const notice=await publishAnnouncement(adapter,'a',pub);demoted=false
 const revokeRace={prepare(sql:string){if(sql.startsWith('UPDATE share_sale_announcements')&&!demoted){demoted=true;db.prepare("DELETE FROM app_user_roles WHERE user_id='a'").run()}return prepare(sql)}} as D1Database
 await assert.rejects(withdrawAnnouncement(revokeRace,'a',{announcementId:notice.id,requestKey:'66666666-6666-4666-8666-666666666666'}));assert.equal((db.prepare('SELECT withdrawn_at FROM share_sale_announcements').get() as {withdrawn_at:string|null}).withdrawn_at,null);db.close()
})

test('administrator demotion prevents extension publication and retry disclosure',async()=>{
 const {db,adapter}=fixture();const notice=await publishAnnouncement(adapter,'a',pub)
 db.exec("INSERT INTO share_sale_status_events(id,sale_id,status_date,status,new_deadline_date,created_by,request_key) VALUES('extension-race','sale','2026-02-01','extended','2026-04-01','a','extension-race-key')")
 const prepare=adapter.prepare.bind(adapter);let demoted=false
 const race={prepare(sql:string){if(sql.startsWith('INSERT INTO share_sale_announcement_extensions')&&!demoted){demoted=true;db.prepare("DELETE FROM app_user_roles WHERE user_id='a'").run()}return prepare(sql)}} as D1Database
 await assert.rejects(publishExtension(race,'a',{announcementId:notice.id,eventId:'extension-race',requestKey:'77777777-7777-4777-8777-777777777777'}))
 assert.equal((db.prepare('SELECT count(*) AS n FROM share_sale_announcement_extensions').get() as {n:number}).n,0);db.close()
})

test('future sale requests cannot be published or offered in admin choices',async()=>{
 const {db,adapter}=fixture();db.exec("INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('future-sale','seller',10,200,'UGX',date('now','+3 hours','+1 day'),'a','future-sale-key')")
 const sales=await (await import('../../src/server/announcements/service.ts')).listAdminSales(adapter,'a');assert.equal(sales.some(s=>s.id==='future-sale'),false)
 const futureDate=(db.prepare("SELECT date('now','+3 hours','+1 day') AS date").get() as {date:string}).date
 await assert.rejects(publishAnnouncement(adapter,'a',{...pub,saleId:'future-sale',expectedRequestDate:futureDate,expectedDeadlineDate:null,requestKey:'99999999-9999-4999-8999-999999999999'}),/review|future|changed/i)
 assert.equal((db.prepare("SELECT count(*) AS n FROM share_sale_announcements WHERE sale_id='future-sale'").get() as {n:number}).n,0);db.close()
})
