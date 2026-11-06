import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const path = 'migrations/0002_domain.sql'
function run(sql: string) {
  const schema = readFileSync(path, 'utf8')
  return spawnSync('sqlite3', [':memory:'], { input: `.bail on\nPRAGMA foreign_keys=ON;\n${schema}\n${sql}`, encoding: 'utf8' })
}
const member = `INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','A Member','admin');`

test('domain migration exists', () => assert.ok(existsSync(path)))
test('separate loans retain their own dated terms', () => {
  const result = run(`${member}
    INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,maturity_date,terms,created_by) VALUES
      ('l1','m',10000,'UGX','2026-01-01','2027-01-01','Terms A','admin'),
      ('l2','m',20000,'UGX','2026-02-01','2028-02-01','Terms B','admin');
    SELECT count(*) FROM loans WHERE member_id='m';`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '2')
})
test('invalid money, unknown references and invalid dates are rejected', () => {
  const cases = [
    `${member} INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('l','m',-1,'UGX','2026-01-01','Terms','admin');`,
    `INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('l','missing',100,'UGX','2026-01-01','Terms','admin');`,
    `${member} INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,maturity_date,terms,created_by) VALUES ('l','m',100,'UGX','2026-02-01','2026-01-01','Terms','admin');`,
    `${member} INSERT INTO share_events(id,member_id,event_type,shares,event_date,created_by) VALUES ('s','m','issue',0,'2026-01-01','admin');`,
    `INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES ('v','missing','2026-01-01',100,'UGX','market','admin');`,
    `INSERT INTO policy_targets(id,asset_class,target_basis_points,effective_date,created_by) VALUES ('p','equities',10001,'2026-01-01','admin');`,
  ]
  for (const sql of cases) assert.notEqual(run(sql).status, 0, sql)
})
test('records share events, bookings and separate valuations without posting a journal', () => {
  const result = run(`${member}
    INSERT INTO share_events(id,member_id,event_type,shares,event_date,created_by) VALUES ('s','m','issue',10,'2026-01-01','admin');
    INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES ('b','m',1000,'UGX','2026-01-01','admin');
    INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES ('i','Example','equities','UGX','admin');
    INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES ('v','i','2026-01-01',1100,'UGX','market','admin');
    SELECT count(*) FROM investment_valuations;`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '1')
})
test('records dated policy ranges without inventing a point target', () => {
  const result = run(`INSERT INTO policy_targets(id,asset_class,min_basis_points,max_basis_points,effective_date,created_by) VALUES ('p','equities',2500,4500,'2026-01-01','admin'); SELECT min_basis_points || '-' || max_basis_points FROM policy_targets;`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '2500-4500')
  for (const bounds of ['4500,2500', '-1,4500', '2500,10001']) {
    assert.notEqual(run(`INSERT INTO policy_targets(id,asset_class,min_basis_points,max_basis_points,effective_date,created_by) VALUES ('p','equities',${bounds},'2026-01-01','admin');`).status, 0)
  }
})
test('records a joint holding once without assigning ownership percentages', () => {
  const result = run(`${member}
    INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m2','002','Second Member','admin');
    INSERT INTO joint_shareholdings(id,name,created_by) VALUES ('h','Joint holding','admin');
    INSERT INTO joint_shareholding_members(shareholding_id,member_id,created_by) VALUES ('h','m','admin'),('h','m2','admin');
    INSERT INTO share_events(id,joint_shareholding_id,event_type,shares,event_date,created_by) VALUES ('s','h','opening',100,'2026-01-01','admin');
    SELECT shares || ':' || (SELECT count(*) FROM joint_shareholding_members WHERE shareholding_id='h') FROM share_events WHERE id='s';`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '100:2')
  assert.notEqual(run(`${member} INSERT INTO share_events(id,event_type,shares,event_date,created_by) VALUES ('s','opening',100,'2026-01-01','admin');`).status, 0)
})
test('records borrower-held bookings separately from partial fulfilments', () => {
  const result = run(`${member}
    INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES ('b','m',1000,'UGX','2026-01-01','held','admin');
    INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by) VALUES ('f','b',250,'2026-01-02','admin');
    SELECT status || ':' || amount_minor FROM credit_bookings JOIN credit_booking_fulfilments ON booking_id=credit_bookings.id;`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'held:250')
})
