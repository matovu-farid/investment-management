import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
test('share request IDs prevent duplicate events and holdings', () => {
 const schema = ['0002_domain.sql','0006_share_idempotency.sql'].map(f=>readFileSync('migrations/'+f,'utf8')).join('\n')
 const sql = `${schema}\nINSERT INTO members(id,member_number,full_name,created_by) VALUES('m','1','Member','admin');\nINSERT INTO share_events(id,member_id,event_type,shares,event_date,created_by,request_id) VALUES('a','m','opening',10,'2026-11-05','admin','retry') ON CONFLICT(request_id) DO NOTHING;\nINSERT INTO share_events(id,member_id,event_type,shares,event_date,created_by,request_id) VALUES('b','m','opening',10,'2026-11-05','admin','retry') ON CONFLICT(request_id) DO NOTHING;\nSELECT count(*) FROM share_events;`
 const result = spawnSync('sqlite3',[':memory:'],{input:`.bail on\n${sql}`,encoding:'utf8'}); assert.equal(result.status,0,result.stderr); assert.equal(result.stdout.trim(),'1')
})
