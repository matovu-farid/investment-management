import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readdirSync,readFileSync} from 'node:fs'
import {listBoardPacketAccess,grantBoardPacketAccess,revokeBoardPacketAccess,listMyBoardPackets} from '../../src/server/board-packet-access/service.ts'
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','admin@example.test',1,1),('u','User','user@example.test',1,1),('x','Other','other@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','001','Member','a'),('n','002','Other','a'); INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('l','u','m','a'),('z','x','n','a'); INSERT INTO board_packet_previews(id,created_by,packet) VALUES('preview','a','{"start":"2026-01-01","end":"2026-04-30","secret":"frozen sensitive data"}'); INSERT INTO board_packets(id,preview_id,request_key,created_by) VALUES('packet','preview','saved','a');`)
 const stmt=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return stmt(q,p)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args as never[]).changes)}}}})
 return {sql,db:{prepare:(q:string)=>stmt(q),async batch(s:{all:()=>Promise<unknown>}[]){return Promise.all(s.map(x=>x.all()))}} as unknown as D1Database}
}
const k='5a5c5220-5ec2-4f62-97d0-5b72ccff4f5b',k2='6a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'
const grant={packetId:'packet',userId:'u',linkId:'l',expectedMemberName:'Member',expectedMemberNumber:'001',expectedEmail:'user@example.test',requestKey:k}
test('only explicit selected account receives the exact saved packet; admin views contain metadata only',async()=>{
 const {sql,db}=setup();await assert.rejects(listBoardPacketAccess(db,'u'),/unauthorized/i);await assert.rejects(grantBoardPacketAccess(db,'u',grant),/unauthorized/i);assert.deepEqual(await listMyBoardPackets(db,'u'),[])
 const options=await listBoardPacketAccess(db,'a');assert.deepEqual({...options.packets[0]},{id:'packet',createdAt:options.packets[0].createdAt,start:'2026-01-01',end:'2026-04-30'});assert.equal(options.recipients.length,2)
 const result=await grantBoardPacketAccess(db,'a',grant);assert.equal(result.active,true);assert.deepEqual(await grantBoardPacketAccess(db,'a',grant),result);await assert.rejects(grantBoardPacketAccess(db,'a',{...grant,userId:'x'}),/reused/i)
 const found=await listMyBoardPackets(db,'u');assert.equal(found.length,1);assert.deepEqual(found[0].packet,{start:'2026-01-01',end:'2026-04-30',secret:'frozen sensitive data'});assert.deepEqual(await listMyBoardPackets(db,'x'),[]);assert.throws(()=>sql.exec("UPDATE board_packet_previews SET packet='{}' WHERE id='preview'"),/immutable/i);sql.close()
})
test('revocation is immediate, durable, retryable and cannot be altered',async()=>{
 const {sql,db}=setup();const g=await grantBoardPacketAccess(db,'a',grant);const rev={grantId:g.id,requestKey:k2};await assert.rejects(revokeBoardPacketAccess(db,'u',rev),/unauthorized/i);assert.deepEqual(await revokeBoardPacketAccess(db,'a',rev),{id:g.id});assert.deepEqual(await revokeBoardPacketAccess(db,'a',rev),{id:g.id});assert.deepEqual(await listMyBoardPackets(db,'u'),[]);assert.equal((await grantBoardPacketAccess(db,'a',grant)).active,false);assert.throws(()=>sql.exec('DELETE FROM board_packet_access_revocations'),/immutable/i);sql.close()
})
test('revoked or inactive member links cannot receive packets or regain access by relinking',async()=>{
 const {sql,db}=setup();await grantBoardPacketAccess(db,'a',grant);sql.exec("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a',revoke_request_key='test-revoke' WHERE id='l'");assert.deepEqual(await listMyBoardPackets(db,'u'),[]);assert.equal((await grantBoardPacketAccess(db,'a',grant)).active,false);sql.exec("INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('l2','u','m','a')");assert.deepEqual(await listMyBoardPackets(db,'u'),[]);await grantBoardPacketAccess(db,'a',{...grant,linkId:'l2',requestKey:k2});assert.equal((await listMyBoardPackets(db,'u')).length,1);sql.exec("UPDATE members SET status='inactive' WHERE id='m'");assert.deepEqual(await listMyBoardPackets(db,'u'),[]);sql.close()
})
test('database enforces active exact links and disallows duplicate active grants',async()=>{
 const {sql,db}=setup();await assert.rejects(grantBoardPacketAccess(db,'a',{...grant,userId:'x'}),/unavailable/i);await grantBoardPacketAccess(db,'a',grant);await assert.rejects(grantBoardPacketAccess(db,'a',{...grant,requestKey:k2}),/already shared/i);assert.throws(()=>sql.exec("INSERT INTO board_packet_access_grants(id,packet_id,user_id,link_id,member_id,reviewed_member_name,reviewed_member_number,reviewed_email,request_key,granted_by) VALUES('bad','packet','x','l','m','Member','001','other@example.test','r','a')"),/link unavailable|recipient identity changed/i);assert.throws(()=>sql.exec('DELETE FROM board_packet_access_grants'),/immutable/i);sql.close()
})
test('grant insertion rechecks the selected link and administrator atomically after review',async()=>{
 for(const stale of ['link','admin']){
  const {sql,db}=setup();let injected=false
  const race={prepare(query:string){const statement=db.prepare(query);if(!query.startsWith('INSERT INTO board_packet_access_grants'))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args:unknown[])=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{if(!injected){injected=true;if(stale==='link')sql.exec("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a',revoke_request_key='race' WHERE id='l'");else sql.exec("DELETE FROM app_user_roles WHERE user_id='a'")}return run()};return bound};return statement},batch:db.batch.bind(db)} as D1Database
  await assert.rejects(grantBoardPacketAccess(race,'a',grant));assert.equal(sql.prepare('SELECT count(*) n FROM board_packet_access_grants').get()!.n,0);sql.close()
 }
})
test('grant refuses stale reviewed identity and unchanged retries survive later identity changes',async()=>{
 const {sql,db}=setup();sql.exec("UPDATE members SET full_name='New name' WHERE id='m'");await assert.rejects(grantBoardPacketAccess(db,'a',grant),/unavailable/i);assert.equal(sql.prepare('SELECT count(*) n FROM board_packet_access_grants').get()!.n,0)
 const reviewed={...grant,expectedMemberName:'New name'};const saved=await grantBoardPacketAccess(db,'a',reviewed);sql.exec("UPDATE members SET full_name='Changed again' WHERE id='m'; UPDATE \"user\" SET email='new@example.test' WHERE id='u'");assert.deepEqual(await grantBoardPacketAccess(db,'a',reviewed),saved);await assert.rejects(grantBoardPacketAccess(db,'a',{...reviewed,expectedEmail:'new@example.test'}),/reused/i);assert.equal((await listBoardPacketAccess(db,'a')).grants[0].email,'user@example.test');sql.close()
})

test('summary grant sends only a frozen allowlisted projection and rejects stale review or mode reuse',async()=>{
 const {boardPacketSummary,summaryCsv}=await import('../../src/lib/board-packet-summary.ts')
 const {sql,db}=setup()
 const data={start:'2026-01-01',end:'2026-04-30',activity:{secret:'topsecret-activity'},lending:{data:{csv:'topsecret-csv',loans:[{memberName:'topsecret-member'}]}},sales:{notes:'topsecret-sale'},calculatedLending:{capturedFrom:'2026-05-01 12:00:00',capturedTo:'2026-05-01 12:00:01',data:{asOf:'2026-04-30',eligible:2,included:1,omitted:{unconfigured:1,pendingRepayments:0,unavailable:0},totals:[{currency:'UGX',principalMinor:'500',interestMinor:'3',secret:'topsecret-total'}],secret:'topsecret-data'}}}
 sql.prepare("INSERT INTO board_packet_previews(id,created_by,packet) VALUES('summary-preview','a',?)").run(JSON.stringify(data));sql.exec("INSERT INTO board_packets(id,preview_id,request_key,created_by) VALUES('summary-packet','summary-preview','summary-save','a')")
 const expectedSummary=boardPacketSummary(data),request={...grant,packetId:'summary-packet',shareMode:'summary',expectedSummary}
 assert.throws(()=>sql.prepare("INSERT INTO board_packet_access_grants(id,packet_id,user_id,link_id,member_id,reviewed_member_name,reviewed_member_number,reviewed_email,request_key,granted_by,share_mode,summary_json) VALUES('malicious','summary-packet','x','z','n','Other','002','other@example.test','malicious','a','summary',?)").run(JSON.stringify({...expectedSummary,secret:'topsecret-csv'})),/projection/i)
 await assert.rejects(grantBoardPacketAccess(db,'a',{...request,expectedSummary:{...expectedSummary,end:'2026-04-29'}}))
 const g=await grantBoardPacketAccess(db,'a',request);assert.equal(g.active,true);assert.deepEqual(await grantBoardPacketAccess(db,'a',request),g)
 await assert.rejects(grantBoardPacketAccess(db,'a',{...request,shareMode:'full'}),/reused/i)
 const response=await listMyBoardPackets(db,'u');assert.equal(response.length,1);assert.equal(response[0].shareMode,'summary');assert.deepEqual(response[0].packet,expectedSummary)
 assert.doesNotMatch(JSON.stringify(response),/topsecret/);assert.doesNotMatch(summaryCsv(expectedSummary),/topsecret/);assert.match(summaryCsv(expectedSummary),/Small groups may reveal individual balances/);assert.match(summaryCsv(expectedSummary),/accrued but unposted interest/);assert.match(summaryCsv(expectedSummary),/2026-05-01 12:00:01/);assert.deepEqual(await listMyBoardPackets(db,'x'),[])
 assert.throws(()=>sql.exec("UPDATE board_packet_access_grants SET summary_json='{}'"),/immutable/i)
 await revokeBoardPacketAccess(db,'a',{grantId:g.id,requestKey:k2});assert.deepEqual(await listMyBoardPackets(db,'u'),[]);sql.close()
})

test('summary grant rejects a recipient link or identity change between review and write',async()=>{
 const {boardPacketSummary}=await import('../../src/lib/board-packet-summary.ts');for(const stale of ['link','identity']){const {sql,db}=setup()
 const data={start:'2026-01-01',end:'2026-04-30',calculatedLending:{capturedFrom:'2026-05-01 12:00:00',capturedTo:'2026-05-01 12:00:01',data:{asOf:'2026-04-30',eligible:0,included:0,omitted:{unconfigured:0,pendingRepayments:0,unavailable:0},totals:[]}}}
 sql.prepare("INSERT INTO board_packet_previews(id,created_by,packet) VALUES('summary-preview','a',?)").run(JSON.stringify(data));sql.exec("INSERT INTO board_packets(id,preview_id,request_key,created_by) VALUES('summary-packet','summary-preview','summary-save','a')")
 const race={prepare(query:string){const statement=db.prepare(query);if(!query.startsWith('INSERT INTO board_packet_access_grants'))return statement;const bind=statement.bind.bind(statement);statement.bind=(...args:unknown[])=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{if(stale==='link')sql.exec("UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by='a',revoke_request_key='race' WHERE id='l'");else sql.exec("UPDATE \"user\" SET email='changed@example.test' WHERE id='u'");return run()};return bound};return statement},batch:db.batch.bind(db)} as D1Database
 await assert.rejects(grantBoardPacketAccess(race,'a',{...grant,packetId:'summary-packet',shareMode:'summary',expectedSummary:boardPacketSummary(data)}));assert.equal(sql.prepare('SELECT count(*) n FROM board_packet_access_grants').get()!.n,0);sql.close()}
})
