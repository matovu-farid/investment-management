import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {publishShareValue,withdrawShareValue,listMemberShareValues,listAdminShareValues} from '../../src/server/share-values/service.ts'
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0011_member_links.sql','0034_holding_observations.sql','0035_share_values.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1),('u','One','u@example.test',1,1),('v','Two','v@example.test',1,1),('x','Other','x@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','boot'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m1','1','One','a'),('m2','2','Two','a'),('m3','3','Other','a'); INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('l1','u','m1','a'),('l2','v','m2','a'),('l3','x','m3','a'); INSERT INTO joint_shareholdings(id,name,created_by) VALUES('j','Joint Private Name','a'); INSERT INTO joint_shareholding_members(shareholding_id,member_id,created_by) VALUES('j','m1','a'),('j','m2','a');`)
 let revokeAt='';const revoke=(q:string)=>{if(revokeAt&&q.includes(revokeAt)){revokeAt='';db.exec("DELETE FROM app_user_roles WHERE user_id='a'")}}
 type S={q:string;args:unknown[];bind:(...a:unknown[])=>S;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<{meta:{changes:number}}>};const adapter={prepare(q:string):S{return{q,args:[],bind(...a){this.args=a;return this},async first(){revoke(this.q);return db.prepare(this.q).get(...this.args as never[])??null},async all(){revoke(this.q);return{results:db.prepare(this.q).all(...this.args as never[])}},async run(){return{meta:{changes:Number(db.prepare(this.q).run(...this.args as never[]).changes)}}}}}} as unknown as D1Database;return {db,adapter,revokeOn:(q:string)=>{revokeAt=q}}
}

const k=(n:number)=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
function seed(db:DatabaseSync,joint=false){db.exec(`INSERT INTO holding_observations(id,member_id,joint_holding_id,observed_date,shares,source,created_by,request_key) VALUES('o',${joint?"NULL,'j'":"'m1',NULL"},'2020-01-01',9007199254740991,'Register','a','o-key'); INSERT INTO holding_observation_publications(id,observation_id,member_id,joint_holding_id,observed_date,shares,source,published_by,publish_key) SELECT 'h',id,member_id,joint_holding_id,observed_date,shares,source,'a','h-key' FROM holding_observations WHERE id='o'`)}
const request=(joint=false)=>({holdingPublicationId:'h',preview:{memberId:joint?null:'m1',jointHoldingId:joint?'j':null,observedDate:'2020-01-01',shares:'9007199254740991',holdingSource:'Register',recipientIds:joint?['m1','m2']:['m1']},priceDate:'2020-02-01',priceMinor:'9007199254740991',currency:'UGX',basis:'Board indicative',priceSource:'Document p1',requestKey:k(1)})
test('joint values are exact, private, immutable and hidden atomically when parent is withdrawn',async()=>{const {db,adapter}=fixture();seed(db,true);const v=request(true);await assert.rejects(publishShareValue(adapter,'u',v),/unauthorized/i);await assert.rejects(publishShareValue(adapter,'a',{...v,preview:{...v.preview,recipientIds:['m1']}}));const saved=await publishShareValue(adapter,'a',v);assert.deepEqual(await publishShareValue(adapter,'a',v),saved);await assert.rejects(publishShareValue(adapter,'a',{...v,priceMinor:'1'}));for(const user of ['u','v']){const rows=await listMemberShareValues(adapter,user);assert.equal(rows[0].valueMinor,'81129638414606663681390495662081');assert.equal(rows[0].kind,'joint');assert.doesNotMatch(JSON.stringify(rows),/m1|m2|Joint Private Name/)}assert.deepEqual(await listMemberShareValues(adapter,'x'),[]);assert.throws(()=>db.exec("UPDATE share_value_publications SET price_minor=1"),/immutable|withdraw/i);db.exec("UPDATE holding_observation_publications SET withdrawn_at=CURRENT_TIMESTAMP,withdrawn_by='a',withdraw_key='wk' WHERE id='h'");assert.deepEqual(await listMemberShareValues(adapter,'u'),[]);assert.equal((await listAdminShareValues(adapter,'a')).publications[0].active,false);assert.deepEqual(await publishShareValue(adapter,'a',v),{id:saved.id,active:false});await withdrawShareValue(adapter,'a',{publicationId:saved.id,requestKey:k(2)});db.close()})
test('an observed joint holding cannot acquire or lose recipients before or after value publication',async()=>{
 const {db,adapter}=fixture();seed(db,true)
 const add=()=>db.exec("INSERT INTO joint_shareholding_members(shareholding_id,member_id,created_by) VALUES('j','m3','a')")
 const remove=()=>db.exec("DELETE FROM joint_shareholding_members WHERE shareholding_id='j' AND member_id='m1'")
 const replace=()=>db.exec("UPDATE joint_shareholding_members SET member_id='m3' WHERE shareholding_id='j' AND member_id='m1'")
 for(const change of [add,remove,replace])assert.throws(change,/membership is immutable/i)
 await publishShareValue(adapter,'a',request(true))
 for(const change of [add,remove,replace])assert.throws(change,/membership is immutable/i)
 assert.equal((await listMemberShareValues(adapter,'u')).length,1)
 assert.equal((await listMemberShareValues(adapter,'v')).length,1)
 assert.deepEqual(await listMemberShareValues(adapter,'x'),[])
 db.close()
})
test('review binds the source, recipients and exact price; invalid data and duplicate active publications fail',async()=>{const {db,adapter}=fixture();seed(db);const v=request();for(const change of [{priceMinor:'0'},{priceMinor:'1.5'},{priceMinor:'9007199254740992'},{priceDate:'2020-02-30'},{priceDate:'9999-01-01'},{currency:'ugx'},{basis:' '},{priceSource:' '},{preview:{...v.preview,shares:'1'}},{preview:{...v.preview,recipientIds:['m2']}}])await assert.rejects(publishShareValue(adapter,'a',{...v,...change}));const p=await publishShareValue(adapter,'a',v);await assert.rejects(publishShareValue(adapter,'a',{...v,requestKey:k(3)}));assert.deepEqual(await withdrawShareValue(adapter,'a',{publicationId:p.id,requestKey:k(2)}),{id:p.id});assert.deepEqual(await withdrawShareValue(adapter,'a',{publicationId:p.id,requestKey:k(2)}),{id:p.id});assert.deepEqual(await publishShareValue(adapter,'a',v),{id:p.id,active:false});assert.throws(()=>db.exec('DELETE FROM share_value_publications'),/immutable/);assert.equal((await publishShareValue(adapter,'a',{...v,requestKey:k(3)})).active,true);db.close()})
test('republication of underlying holding does not revive an old value',async()=>{const {db,adapter}=fixture();seed(db);const v=request();const p=await publishShareValue(adapter,'a',v);db.exec("UPDATE holding_observation_publications SET withdrawn_at=CURRENT_TIMESTAMP,withdrawn_by='a',withdraw_key='wk' WHERE id='h'; INSERT INTO holding_observation_publications(id,observation_id,member_id,joint_holding_id,observed_date,shares,source,published_by,publish_key) SELECT 'h2',id,member_id,joint_holding_id,observed_date,shares,source,'a','h2-key' FROM holding_observations WHERE id='o'");assert.deepEqual(await listMemberShareValues(adapter,'u'),[]);assert.deepEqual(await publishShareValue(adapter,'a',v),{id:p.id,active:false});await assert.rejects(publishShareValue(adapter,'a',{...v,requestKey:k(3)}));db.close()})
test('a member cannot have two active individual holding publications',()=>{
 const {db}=fixture();seed(db)
 db.exec("INSERT INTO holding_observations(id,member_id,observed_date,shares,source,created_by,request_key) VALUES('o2','m1','2020-01-02',100,'Register 2','a','o2-key')")
 assert.throws(()=>db.exec("INSERT INTO holding_observation_publications(id,observation_id,member_id,observed_date,shares,source,published_by,publish_key) SELECT 'h2',id,member_id,observed_date,shares,source,'a','h2-key' FROM holding_observations WHERE id='o2'"),/UNIQUE constraint failed/)
 db.close()
})

test('share value retries require current administrator authority',async()=>{
 const {db,adapter,revokeOn}=fixture();seed(db,true);const v=request(true),saved=await publishShareValue(adapter,'a',v),restore=()=>db.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','boot')")
 revokeOn('WHERE p.publish_key=?');await assert.rejects(publishShareValue(adapter,'a',v));restore()
 revokeOn('FROM joint_shareholding_members WHERE shareholding_id=?');await assert.rejects(publishShareValue(adapter,'a',v));restore()
 const withdraw={publicationId:saved.id,requestKey:k(2)};await withdrawShareValue(adapter,'a',withdraw);revokeOn('FROM share_value_publications WHERE id=?');await assert.rejects(withdrawShareValue(adapter,'a',withdraw));restore()
 assert.deepEqual(await withdrawShareValue(adapter,'a',withdraw),{id:saved.id});db.close()
})
