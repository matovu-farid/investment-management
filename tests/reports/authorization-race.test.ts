import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createReportRepository } from '../../src/server/reports/repository'
import { reportForPeriod } from '../../src/server/reports/service'

for (const withMember of [false, true]) it(`rejects revocation at the report read boundary (${withMember ? 'populated' : 'empty'} report)`, async () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec('PRAGMA foreign_keys=ON')
  for (const file of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${file}`, 'utf8'))
  sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',1,1);
    INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('admin','admin','bootstrap');`)
  if (withMember) sql.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','001','Sensitive Member','admin')")
  type Statement = { query:string; values:unknown[]; bind:(...values:unknown[])=>Statement; first:()=>Promise<unknown> }
  let dataMaterialized = false
  const db = {
    prepare(query:string):Statement { return { query, values:[], bind(...values){ this.values=values; return this }, async first(){ return sql.prepare(this.query).get(...this.values as never[]) ?? null } } },
    async batch(statements:Statement[]) {
      sql.exec("DELETE FROM app_user_roles WHERE user_id='admin'")
      sql.exec('BEGIN')
      try {
        const results=statements.map(s=>({results:sql.prepare(s.query).all(...s.values as never[])}))
        dataMaterialized=results.some(result=>result.results.some(row=>Object.values(row).includes('Sensitive Member')))
        sql.exec('COMMIT'); return results
      } catch (error) { sql.exec('ROLLBACK'); throw error }
    },
  } as unknown as D1Database
  await expect(reportForPeriod(createReportRepository(db),'admin',{start:'2026-01-01',end:'2026-12-31'})).rejects.toThrow('Unauthorized')
  expect(dataMaterialized).toBe(false)
  sql.close()
})
