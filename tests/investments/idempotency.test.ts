import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createInvestmentRepository } from '../../src/server/investments/repository'

function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8'))
  db.exec(readFileSync('migrations/0004_investment_idempotency.sql', 'utf8'))
  db.exec(readFileSync('migrations/0007_investment_transaction_idempotency.sql', 'utf8'))
  db.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin'),('a','admin')")
  db.exec('CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT)')
  const adapter = { prepare(sql: string) { return { bind(...params: unknown[]) { const stmt = db.prepare(sql); return { async run() { return stmt.run(...params as never[]) }, async first() { return stmt.get(...params as never[]) ?? null } } } } } }
  return { db, repo: createInvestmentRepository(adapter as unknown as D1Database) }
}
describe('D1 idempotency', () => {
  it('returns the original investment for a repeated key and rejects changed data', async () => {
    const { db, repo } = setup()
    const first = { id: 'one', name: 'Bond', assetClass: 'Bonds', currency: 'UGX', status: 'active', createdBy: 'admin' }
    expect(await repo.create(first, 'key')).toEqual(first)
    expect(await repo.create({ ...first, id: 'two' }, 'key')).toEqual(first)
    await expect(repo.create({ ...first, id: 'three', name: 'Different' }, 'key')).rejects.toThrow('different details')
    expect(db.prepare('SELECT count(*) AS n FROM investments').get()).toMatchObject({ n: 1 })
  })
  it('returns the original valuation for a repeated key and rejects changed data', async () => {
    const { db, repo } = setup()
    const investment = { id: 'one', name: 'Bond', assetClass: 'Bonds', currency: 'UGX', status: 'active', createdBy: 'admin' }
    await repo.create(investment, 'investment-key')
    const value = { id: 'v1', investmentId: 'one', valuationDate: '2026-01-01', amountMinor: 100, currency: 'UGX', basis: 'Market', source: null, createdBy: 'admin' }
    expect(await repo.addValuation(value, 'valuation-key')).toEqual(value)
    expect(await repo.addValuation({ ...value, id: 'v2' }, 'valuation-key')).toEqual(value)
    await expect(repo.addValuation({ ...value, id: 'v3', amountMinor: 101 }, 'valuation-key')).rejects.toThrow('different details')
    expect(db.prepare('SELECT count(*) AS n FROM investment_valuations').get()).toMatchObject({ n: 1 })
  })
})

it('deduplicates transaction retries and rejects different facts', async () => {
 const { db, repo } = setup()
 await repo.create({ id:'i', name:'Bond', assetClass:'Bonds', currency:'UGX', status:'active', createdBy:'a' }, 'i-key')
 const tx = { id:'t1', investmentId:'i', transactionDate:'2026-11-05', transactionType:'Dividend', amountMinor:120, reference:null, notes:null, createdBy:'a' }
 expect(await repo.addTransaction(tx, 'tx-key')).toEqual(tx)
 expect(await repo.addTransaction({...tx,id:'t2'}, 'tx-key')).toEqual(tx)
 await expect(repo.addTransaction({...tx,id:'t3',amountMinor:121}, 'tx-key')).rejects.toThrow('different details')
 expect(db.prepare('SELECT count(*) AS n FROM investment_transactions').get()).toMatchObject({n:1})
})

it('does not report a previously voided source as a successful create retry', async () => {
 const {db,repo}=setup()
 await repo.create({id:'i',name:'Bond',assetClass:'Bonds',currency:'UGX',status:'active',createdBy:'a'},'i-key')
 const tx={id:'t',investmentId:'i',transactionDate:'2026-01-01',transactionType:'Dividend',amountMinor:12,reference:null,notes:null,createdBy:'a'}
 await repo.addTransaction(tx,'tx-key')
 db.exec("INSERT INTO investment_source_voids VALUES ('transaction','t','error','2026-11-05')")
 await expect(repo.addTransaction({...tx,id:'new'},'tx-key')).rejects.toThrow(/void/i)
})
