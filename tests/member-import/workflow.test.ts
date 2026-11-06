import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { importMembers } from '../../src/server/member-import/service.ts'
import { issueInvitation, claimInvitation } from '../../src/server/invitations/service.ts'
import { createLoan } from '../../src/server/lending/service.ts'
import { lendingRepository } from '../../src/server/lending/repository.ts'
import { createShareEvent } from '../../src/server/shares/service.ts'
import { createSharesRepository } from '../../src/server/shares/repository.ts'
import { getMyPortfolio } from '../../src/server/portal/service.ts'

test('an imported member can be invited, linked, and receive recorded loan and share facts', async () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec('PRAGMA foreign_keys=ON')
  for (const file of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${file}`, 'utf8'))
  sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES ('admin','Admin','admin@example.test',1,1);
    INSERT INTO app_user_roles(user_id,role,granted_by) VALUES ('admin','admin','bootstrap');`)
  type Statement = { q:string; values:unknown[]; bind:(...values:unknown[])=>Statement; first:()=>Promise<unknown>; all:()=>Promise<{results:unknown[]}>; run:()=>Promise<unknown> }
  const db = {
    prepare(q:string):Statement { return { q, values:[], bind(...values){this.values=values;return this}, async first(){return sql.prepare(this.q).get(...this.values as never[])??null}, async all(){return {results:sql.prepare(this.q).all(...this.values as never[])}}, async run(){const r=sql.prepare(this.q).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}}} } },
    async batch(statements:Statement[]){sql.exec('BEGIN');try{const results=statements.map(s=>({results:sql.prepare(s.q).all(...s.values as never[])}));sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}},
  } as unknown as D1Database
  await importMembers(db,'admin',{rows:[{memberNumber:'00081',fullName:'Test Member',email:'test@example.test'}],requestKey:crypto.randomUUID()})
  const member=sql.prepare("SELECT id,member_number AS number FROM members WHERE member_number='00081'").get() as {id:string;number:string}
  assert.match(member.id,/^[0-9a-f]{32}$/)
  assert.equal(member.number,'00081')
  const loan=await createLoan(lendingRepository(db),'admin',{memberId:member.id,principalMinor:1200,currency:'UGX',disbursementDate:'2026-01-01',maturityDate:'',terms:'Test terms',idempotencyKey:crypto.randomUUID()})
  const share=await createShareEvent(createSharesRepository(db),'admin',{memberId:member.id,jointHoldingId:null,eventType:'opening',shares:5,eventDate:'2026-01-01',reference:null,notes:null,requestId:crypto.randomUUID()})
  const invitation=await issueInvitation(db,'admin',{memberId:member.id,email:'test@example.test',expectedMemberName:'Test Member',expectedMemberNumber:'00081'})
  await claimInvitation(db,{token:invitation.token,password:'Local-test-password-2026!'},'127.0.0.1')
  const user=sql.prepare('SELECT id FROM "user" WHERE email=?').get('test@example.test') as {id:string}
  const portfolio=await getMyPortfolio(db,user.id)
  assert.equal(portfolio.member.id,member.id)
  assert.equal(portfolio.member.memberNumber,'00081')
  assert.equal(portfolio.loans[0].id,loan.id)
  assert.equal(portfolio.shares[0].id,share.id)
  sql.close()
})
