import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createSharesRepository } from '../../src/server/shares/repository.ts'

function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  for (const f of ['0001_auth.sql','0002_domain.sql','0003_roles.sql','0006_share_idempotency.sql','0065_joint_review.sql']) db.exec(readFileSync(`migrations/${f}`, 'utf8'))
  db.exec("INSERT INTO \"user\"(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m1','1','One','admin'),('m2','2','Two','admin')")
  type Statement = { sql:string; args:unknown[]; bind:(...args:unknown[])=>Statement; first:()=>Promise<unknown>; all:()=>Promise<{results:unknown[]}> }
  const adapter = {
    prepare(sql:string):Statement { return { sql, args:[], bind(...args) { this.args=args; return this }, async first() { return db.prepare(sql).get(...this.args as never[]) ?? null }, async all() { return {results:db.prepare(sql).all(...this.args as never[])} } } },
    async batch(statements:Statement[]) { db.exec('BEGIN'); try { for (const s of statements) db.prepare(s.sql).run(...s.args as never[]); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error } },
  } as unknown as D1Database
  return { db, repo:createSharesRepository(adapter) }
}

test('concurrent identical joint holding requests return the same saved holding', async () => {
  const { db, repo } = setup()
  const holding = { id:'first', name:'Joint', memberIds:['m1','m2'], members:[{id:'m1',memberNumber:'1',fullName:'One'},{id:'m2',memberNumber:'2',fullName:'Two'}], createdBy:'admin', requestId:'same-key' }
  const [first, retry] = await Promise.all([repo.createJoint(holding),repo.createJoint({...holding,id:'second',memberIds:['m2','m1']})])
  assert.equal(first.id, retry.id)
  assert.deepEqual([...retry.memberIds].sort(), ['m1','m2'])
  assert.equal((db.prepare('SELECT count(*) AS n FROM joint_shareholdings').get() as {n:number}).n, 1)
  assert.equal((db.prepare('SELECT count(*) AS n FROM joint_shareholding_members').get() as {n:number}).n, 2)
  db.close()
})

test('concurrent different joint holding details with the same key are rejected', async () => {
  const { db, repo } = setup()
  const holding = { id:'first', name:'Joint', memberIds:['m1','m2'], members:[{id:'m1',memberNumber:'1',fullName:'One'},{id:'m2',memberNumber:'2',fullName:'Two'}], createdBy:'admin', requestId:'same-key' }
  const [first, conflict] = await Promise.allSettled([repo.createJoint(holding),repo.createJoint({...holding,id:'second',name:'Different'})])
  assert.equal(first.status, 'fulfilled')
  assert.equal(conflict.status, 'rejected')
  if (conflict.status === 'rejected') assert.match(String(conflict.reason), /Request ID already used for different holding/)
  db.close()
})
