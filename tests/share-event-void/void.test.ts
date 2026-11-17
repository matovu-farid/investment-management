import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

function setup() {
  const db = new DatabaseSync(':memory:')
  for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync('migrations/' + f, 'utf8'))
  db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','a@example.test',1,1),('member','Member','m@example.test',1,1);
    INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap');
    INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','M1','Test member','admin');
    INSERT INTO joint_shareholdings(id,name,created_by) VALUES('j','Joint','admin');
    INSERT INTO joint_shareholding_members(shareholding_id,member_id,created_by) VALUES('j','m','admin');
    INSERT INTO share_events(id,member_id,event_type,shares,event_date,created_by) VALUES('individual','m','opening',10,'2026-01-01','admin');
    INSERT INTO share_events(id,joint_shareholding_id,event_type,shares,event_date,created_by) VALUES('joint','j','bonus',5,'2026-01-02','admin');`)
  return db
}
test('void records reject non-admins and missing sources, retain immutable individual and joint events', () => {
  const db = setup()
  const sql = "INSERT INTO share_event_voids(id,event_id,reason,request_key,created_by) VALUES('v','individual','mistake','key','admin')"
  assert.throws(() => db.exec(sql.replace("'admin')", "'member')")), /unauthorized/i)
  assert.throws(() => db.exec(sql.replace("'individual'", "'missing'")), /not found|foreign key/i)
  db.exec(sql)
  db.exec(sql.replace("'v','individual'", "'v2','joint'").replace("'key'", "'key2'"))
  assert.throws(() => db.exec("UPDATE share_event_voids SET reason='changed'"), /immutable/i)
  assert.throws(() => db.exec('DELETE FROM share_event_voids'), /immutable/i)
  assert.throws(() => db.exec("UPDATE share_events SET shares=20 WHERE id='individual'"), /void/i)
  assert.throws(() => db.exec("DELETE FROM share_events WHERE id='joint'"), /void|foreign key/i)
  assert.equal((db.prepare('SELECT count(*) n FROM share_events').get() as {n:number}).n,2)
})
test('service authorizes, retries identically and rejects altered or duplicate requests', async () => {
  const { voidShareEvent } = await import('../../src/server/share-event-void/service.ts')
  const sql=setup()
  let revokeAt='';const stmt=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return stmt(q,p)},async first(){if(revokeAt&&q.includes(revokeAt)){revokeAt='';sql.exec("DELETE FROM app_user_roles WHERE user_id='admin'")}return sql.prepare(q).get(...args as never[])??null},async run(){return sql.prepare(q).run(...args as never[])}})
  const db={prepare:(q:string)=>stmt(q)} as unknown as D1Database
  const input={eventId:'individual',reason:'duplicate',requestKey:'fa5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}
  await assert.rejects(voidShareEvent(db,'member',input),/unauthorized/i)
  const a=await voidShareEvent(db,'admin',input)
  assert.equal((await voidShareEvent(db,'admin',input)).id,a.id)
  revokeAt='FROM share_event_voids WHERE request_key=?';await assert.rejects(voidShareEvent(db,'admin',input));sql.exec("INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap')")
  await assert.rejects(voidShareEvent(db,'admin',{...input,reason:'changed'}),/already used/i)
  await assert.rejects(voidShareEvent(db,'admin',{...input,requestKey:'7a5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}),/unique/i)
})
test('voiding an event leaves a separately sourced published holding observation unchanged', () => {
 const db=setup()
 db.exec(`INSERT INTO holding_observations(id,member_id,observed_date,shares,source,created_by,request_key) VALUES('o','m','2026-01-01',10,'independent register','admin','ok');
 INSERT INTO holding_observation_publications(id,observation_id,member_id,observed_date,shares,source,published_by,publish_key) VALUES('p','o','m','2026-01-01',10,'independent register','admin','pk');
 INSERT INTO share_event_voids(id,event_id,reason,request_key,created_by) VALUES('v','individual','error','vk','admin');`)
 assert.deepEqual({...db.prepare("SELECT shares,source,withdrawn_at FROM holding_observation_publications WHERE id='p'").get()}, {shares:10,source:'independent register',withdrawn_at:null})
})
