import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createReportRepository } from '../../src/server/reports/repository'
function reportDb() {
  const db = new DatabaseSync(':memory:')
  db.exec("CREATE TABLE app_user_roles(user_id TEXT,role TEXT); INSERT INTO app_user_roles VALUES('admin','admin')")
  db.exec(`CREATE TABLE cash_entries(id TEXT,entry_date TEXT,direction TEXT,amount_minor TEXT,currency TEXT,counterparty TEXT,reference TEXT,description TEXT,created_by TEXT,created_at TEXT);
    CREATE TABLE cash_entry_voids(entry_id TEXT,created_at TEXT,reason TEXT,created_by TEXT)`)
  return db
}
function sqliteAdapter(db: DatabaseSync) {
  type Statement = { sql: string; args: unknown[]; bind: (...params: unknown[]) => Statement }
  return {
    prepare(sql: string): Statement { return { sql, args: [], bind(...params) { this.args = params; return this } } },
    async batch(statements: Statement[]) { return statements.map(s => ({ results: db.prepare(s.sql).all(...s.args as never[]) })) },
  }
}
it('retains in-period cash entries and current void details with exact text amounts', async () => {
  const db = reportDb()
  db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  for (const f of ['0002_domain.sql','0020_booking_history.sql','0015_share_sales.sql','0023_share_trades.sql']) db.exec(readFileSync(`migrations/${f}`,'utf8'))
  db.exec(`INSERT INTO cash_entries VALUES
    ('before','2026-01-31','receipt','1','UGX','','','before','a','2026-01-31'),
    ('start','2026-02-01','payment','123456789012345678901','UGX','=formula','r','Office','a','2026-02-01'),
    ('end','2026-02-28','receipt','50','USD','','','receipt','a','2026-02-28'),
    ('after','2026-03-01','receipt','2','UGX','','','after','a','2026-03-01');
    INSERT INTO cash_entry_voids VALUES('start','2026-03-05','Correction','a')`)
  const report = await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-02-01','2026-02-28', 'admin')
  expect(report.cashEntries).toHaveLength(2)
  expect(report.cashEntries?.find(row => row.id === 'start')).toMatchObject({amountMinor:'123456789012345678901',voidedAt:'2026-03-05',voidReason:'Correction',voidedBy:'a'})
  db.close()
})
it('reads the snapshot and period activity in one transaction when a fulfilment arrives during reporting', async () => {
  const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql', 'utf8')); db.exec(readFileSync('migrations/0015_share_sales.sql','utf8')); db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
  db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','1','Member','admin'); INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES ('b','m',100,'UGX','2026-01-01','admin')")
  const insert = () => db.exec("INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by) VALUES ('f','b',40,'2026-02-01','admin')")
  let inserted = false
  type Statement = { sql: string; args: unknown[]; bind: (...params: unknown[]) => Statement; all: () => Promise<{results: unknown[]}> }
  const adapter = {
    prepare(sql: string): Statement { return { sql, args: [], bind(...params) { this.args = params; return this }, async all() { const results = db.prepare(this.sql).all(...this.args as never[]); if (this.sql.includes('AS fulfilledMinor') && !inserted) { insert(); inserted = true }; return { results } } } },
    async batch(statements: Statement[]) { const results = statements.map(s => ({results: db.prepare(s.sql).all(...s.args as never[])})); insert(); inserted = true; return results },
  }
  const report = await createReportRepository(adapter as unknown as D1Database).forPeriod('2026-02-01','2026-02-28', 'admin')
  expect(report.bookingSnapshot[0].fulfilledMinor).toBe('0')
  expect(report.fulfilments).toHaveLength(0)
  expect(inserted).toBe(true)
  db.close()
})
it('filters dated facts by business date and identifies joint holders', async () => {
  const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql', 'utf8')); db.exec(readFileSync('migrations/0015_share_sales.sql','utf8')); db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
  db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','Member','a');
    INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('a','m',100,'UGX','2026-01-01','terms','a'),('b','m',200,'UGX','2026-03-01','terms','a');
    INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES ('b','m',300,'UGX','2026-02-01','a');
    INSERT INTO joint_shareholdings(id,name,created_by) VALUES ('h','Joint holders','a');
    INSERT INTO share_events(id,joint_shareholding_id,event_type,shares,event_date,created_by) VALUES ('s','h','opening',20,'2026-01-01','a');
    INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES ('i','Bond','Bonds','UGX','a');
    INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES ('v','i','2026-03-01',50,'UGX','market','a');`)
  const adapter = sqliteAdapter(db)
  const report = await createReportRepository(adapter as unknown as D1Database).forPeriod('0001-01-01', '2026-02-01', 'admin')
  expect(report.loans).toHaveLength(1); expect(report.loans[0]).toMatchObject({ principalMinor: 100 })
  expect(report.bookings).toHaveLength(1); expect(report.shareEvents[0]).toMatchObject({ holder: 'Joint holders', shares: 20 })
  expect(report.valuations).toHaveLength(0); expect(report.investments).toHaveLength(1); expect(report.members).toHaveLength(1)
})

it('reports dated repayments, fulfilments and investment transactions through the selected date', async () => {
  const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql', 'utf8')); db.exec(readFileSync('migrations/0015_share_sales.sql','utf8')); db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
  db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','Member','admin');
    INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('l1','m',100,'UGX','2026-01-01','terms','admin'), ('l2','m',200,'USD','2026-01-02','terms','admin');
    INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,reference,created_by) VALUES ('r0','l1','2026-01-31',5,NULL,'admin'), ('r1','l1','2026-02-01',25,'receipt','admin'), ('r2','l2','2026-02-02',40,NULL,'admin');
    INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES ('b','m',300,'UGX','2026-01-01','admin');
    INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,notes,created_by) VALUES ('f0','b',5,'2026-01-31',NULL,'admin'),('f1','b',50,'2026-02-01','partial','admin'),('f2','b',25,'2026-02-02',NULL,'admin');
    INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES ('i','Bond','Bonds','UGX','admin');
    INSERT INTO investment_transactions(id,investment_id,transaction_date,transaction_type,amount_minor,reference,notes,created_by) VALUES ('t0','i','2026-01-31','interest',5,NULL,NULL,'admin'),('t1','i','2026-02-01','interest',10,'ref','cash income','admin'),('t2','i','2026-02-02','purchase',20,NULL,NULL,'admin');`)
  db.exec("UPDATE credit_booking_fulfilments SET loan_id='l1' WHERE id='f1'")
  const adapter = sqliteAdapter(db)
  const report = await createReportRepository(adapter as unknown as D1Database).forPeriod('2026-02-01', '2026-02-01', 'admin')
  expect(report.repayments).toEqual([{ member: 'Member', loanId: 'l1', disbursementDate: '2026-01-01', date: '2026-02-01', amountMinor: 25, currency: 'UGX', reference: 'receipt', notes: null, voidedAt: null, voidReason: null }])
  expect(report.fulfilments).toEqual([{ member: 'Member', bookingId: 'b', loanId: 'l1', requestedDate: '2026-01-01', date: '2026-02-01', amountMinor: 50, currency: 'UGX', notes: 'partial', voidedAt: null, voidReason: null }])
  expect(report.transactions).toEqual([{ investment: 'Bond', date: '2026-02-01', type: 'interest', amountMinor: 10, currency: 'UGX', reference: 'ref', notes: 'cash income', voidedAt: null, voidReason: null }])
})

it('includes both period boundaries across years while preserving valuation history through end', async () => {
  const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql', 'utf8')); db.exec(readFileSync('migrations/0015_share_sales.sql','utf8')); db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
  db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','Member','admin');
    INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES
      ('before','m',1,'UGX','2025-12-30','terms','admin'),('start','m',2,'UGX','2025-12-31','terms','admin'),
      ('end','m',3,'UGX','2026-04-30','terms','admin'),('after','m',4,'UGX','2026-05-01','terms','admin');
    INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES ('i','Bond','Bonds','UGX','admin');
    INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES
      ('v-before','i','2025-01-01',1,'UGX','market','admin'),('v-end','i','2026-04-30',2,'UGX','market','admin'),('v-after','i','2026-05-01',3,'UGX','market','admin');`)
  const adapter = sqliteAdapter(db)
  const report = await createReportRepository(adapter as unknown as D1Database).forPeriod('2025-12-31', '2026-04-30', 'admin')
  expect(report.loans.map(row => row.principalMinor)).toEqual([3, 2])
  expect(report.valuations.map(row => row.amountMinor)).toEqual([2, 1])
  expect(report.members).toHaveLength(1)
  expect(report.investments).toHaveLength(1)
})

it('reports only hold and resume events within both period boundaries', async () => {
 const db=reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)");db.exec(readFileSync('migrations/0002_domain.sql','utf8'));db.exec(readFileSync('migrations/0020_booking_history.sql','utf8'));db.exec(readFileSync('migrations/0015_share_sales.sql','utf8'));db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
 db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','001','Member','admin');
 INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES('b','m',300,'UGX','2026-01-01','waiting','admin');
 INSERT INTO booking_status_events(id,booking_id,event_type,event_date,reason,request_key,created_by) VALUES
 ('before','b','held','2026-01-31','before','k1','admin'),('start','b','held','2026-02-01','borrower requested hold','k2','admin'),
 ('end','b','resumed','2026-04-30','request resumed','k3','admin'),('after','b','held','2026-05-01','after','k4','admin');`)
 const adapter = sqliteAdapter(db)
 const report=await createReportRepository(adapter as unknown as D1Database).forPeriod('2026-02-01','2026-04-30', 'admin')
 expect(report.bookingStatusEvents).toEqual([
 {member:'Member',bookingId:'b',requestedDate:'2026-01-01',date:'2026-04-30',type:'resumed',reason:'request resumed',createdBy:'admin'},
 {member:'Member',bookingId:'b',requestedDate:'2026-01-01',date:'2026-02-01',type:'held',reason:'borrower requested hold',createdBy:'admin'}])
 db.close()
})

it('shows a cutoff snapshot of older and current bookings, separating currencies and later fulfilments', async () => {
  const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql', 'utf8')); db.exec(readFileSync('migrations/0015_share_sales.sql','utf8')); db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
  db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','Member','admin');
    INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,status,created_by) VALUES
      ('old','m',300,'UGX','2026-01-01','held','admin'),('current','m',200,'UGX','2026-02-01','closed','admin'),
      ('dollar','m',100,'USD','2026-01-10','cancelled','admin'),('future','m',500,'USD','2026-02-03','waiting','admin');
    INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by) VALUES
      ('f1','old',50,'2026-01-31','admin'),('f2','old',25,'2026-02-02','admin'),
      ('f3','old',100,'2026-02-03','admin'),('f4','current',100,'2026-02-02','admin'),('f5','current',100,'2026-02-02','admin');`)
  const adapter = sqliteAdapter(db)
  const report = await createReportRepository(adapter as unknown as D1Database).forPeriod('2026-02-01', '2026-02-02', 'admin')
  expect(report.bookingSnapshot).toEqual([
    { bookingId: 'old', member: 'Member', requestedDate: '2026-01-01', currency: 'UGX', storedStatus: 'held', requestedMinor: '300', fulfilledMinor: '75', remainingMinor: '225' },
    { bookingId: 'dollar', member: 'Member', requestedDate: '2026-01-10', currency: 'USD', storedStatus: 'cancelled', requestedMinor: '100', fulfilledMinor: '0', remainingMinor: '100' },
    { bookingId: 'current', member: 'Member', requestedDate: '2026-02-01', currency: 'UGX', storedStatus: 'closed', requestedMinor: '200', fulfilledMinor: '200', remainingMinor: '0' },
  ])
  expect(report.bookingAgeReview?.find(row=>row.bookingId==='current')).toMatchObject({completedDate:'2026-02-02',daysToRecordedCompletion:1,review:'Recorded completion within 30 days'})
  expect(report.bookingAgeReview?.find(row=>row.bookingId==='old')).toMatchObject({completedDate:null,review:'30+ days; review remainder'})
  expect(report.bookingAgeSummary).toEqual([{total:3,completedWithin30:1,completedAfter30:0,remainderUnder30:1,remainder30OrMore:1,notClassified:0}])
  expect(report.bookingSnapshotTotals).toEqual([
    { currency: 'UGX', requestedMinor: '500', fulfilledMinor: '275', remainingMinor: '225' },
    { currency: 'USD', requestedMinor: '100', fulfilledMinor: '0', remainingMinor: '100' },
  ])
  db.close()
})

it('preserves exact currency totals above JavaScript safe integer precision', async () => {
  const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
  db.exec(readFileSync('migrations/0002_domain.sql', 'utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql', 'utf8')); db.exec(readFileSync('migrations/0015_share_sales.sql','utf8')); db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
  db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','001','Member','admin');
    INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES
      ('a','m',9007199254740991,'UGX','2026-01-01','admin'),('b','m',10,'UGX','2026-01-02','admin');
    INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by) VALUES
      ('f','a',1,'2026-01-03','admin');`)
  const adapter = sqliteAdapter(db)
  const report = await createReportRepository(adapter as unknown as D1Database).forPeriod('2026-01-01', '2026-01-31', 'admin')
  expect(report.bookingSnapshotTotals).toEqual([{ currency: 'UGX', requestedMinor: '9007199254741001', fulfilledMinor: '1', remainingMinor: '9007199254741000' }])
  db.close()
})

it('includes documented member and group trades on both period boundaries, without inferring settlement', async () => {
 const db = reportDb(); db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
 db.exec(readFileSync('migrations/0002_domain.sql','utf8')); db.exec(readFileSync('migrations/0020_booking_history.sql','utf8'));db.exec(readFileSync('migrations/0015_share_sales.sql','utf8'));db.exec(readFileSync('migrations/0023_share_trades.sql','utf8'))
 db.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES ('s','001','Seller','admin'),('b','002','Buyer','admin');
 INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES ('sale','s',20,100,'UGX','2026-01-01','admin','sale-key');
 INSERT INTO share_trades(id,sale_id,buyer_type,buyer_member_id,shares,trade_date,price_minor,consideration_minor,currency,reference,created_by,request_key) VALUES
 ('before','sale','group',NULL,1,'2026-01-31',100,100,'UGX',NULL,'admin','k0'),
 ('start','sale','member','b',2,'2026-02-01',110,219,'UGX','receipt','admin','k1'),
 ('end','sale','group',NULL,3,'2026-04-30',120,360,'UGX',NULL,'admin','k2'),
 ('after','sale','group',NULL,1,'2026-05-01',130,130,'UGX',NULL,'admin','k3');`)
 const report = await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-02-01','2026-04-30', 'admin')
 expect(report.shareTrades).toEqual([
  {tradeId:'end',voidedAt:null,voidReason:null,saleId:'sale',date:'2026-04-30',seller:'Seller',buyer:'Group',buyerType:'group',shares:3,priceMinor:120,considerationMinor:360,currency:'UGX',reference:null},
  {tradeId:'start',voidedAt:null,voidReason:null,saleId:'sale',date:'2026-02-01',seller:'Seller',buyer:'Buyer',buyerType:'member',shares:2,priceMinor:110,considerationMinor:219,currency:'UGX',reference:'receipt'},
 ])
 db.exec("INSERT INTO share_trade_voids(trade_id,reason,created_at) VALUES('start','Duplicate','2026-06-01 12:00:00')")
 const corrected=await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-02-01','2026-04-30', 'admin')
 expect(corrected.shareTrades.find(t=>t.tradeId==='start')).toMatchObject({voidedAt:'2026-06-01 12:00:00',voidReason:'Duplicate'})
 db.close()
})

it('reports retain source voids and current audit details for past periods',async()=>{const db=reportDb();db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)");for(const f of ['0002_domain.sql','0020_booking_history.sql','0015_share_sales.sql','0023_share_trades.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'));db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','1','Member','admin'); INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES ('l','m',100,'UGX','2026-01-01','terms','admin'); INSERT INTO loan_repayments(id,loan_id,payment_date,amount_minor,created_by) VALUES ('r','l','2026-02-01',10,'admin'); INSERT INTO loan_source_voids VALUES ('repayment','r','wrong amount','2026-11-05 12:00:00')");const r=await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-01-01','2026-02-28', 'admin');expect(r.repayments[0].voidedAt).toBe('2026-11-05 12:00:00');expect(r.repayments[0].voidReason).toBe('wrong amount');db.close()})

it('excludes currently voided fulfilments from totals while retaining labeled period activity',async()=>{const db=reportDb();db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)");for(const f of ['0002_domain.sql','0020_booking_history.sql','0015_share_sales.sql','0023_share_trades.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'));db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','1','Member','admin'); INSERT INTO credit_bookings(id,member_id,requested_minor,currency,requested_date,created_by) VALUES ('b','m',100,'UGX','2026-01-01','admin'); INSERT INTO credit_booking_fulfilments(id,booking_id,amount_minor,fulfilment_date,created_by) VALUES ('f','b',30,'2026-02-01','admin'); INSERT INTO booking_fulfilment_voids VALUES ('f','entry error','2026-11-05 12:00:00')");const report=await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-01-01','2026-02-28', 'admin');expect(report.bookingSnapshot[0].fulfilledMinor).toBe('0');expect(report.bookingSnapshot[0].remainingMinor).toBe('100');expect(report.fulfilments[0]).toMatchObject({amountMinor:30,voidedAt:'2026-11-05 12:00:00',voidReason:'entry error'});db.close()})

it('retains voided investment facts and labels their current audit state',async()=>{
 const db=reportDb()
 db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)")
 for(const f of ['0002_domain.sql','0020_booking_history.sql','0015_share_sales.sql','0023_share_trades.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec("INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bonds','UGX','admin'); INSERT INTO investment_transactions(id,investment_id,transaction_date,transaction_type,amount_minor,created_by) VALUES('t','i','2026-02-01','income',100,'admin'); INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES('v','i','2026-02-01',200,'UGX','market','admin'); INSERT INTO investment_source_voids VALUES('transaction','t','wrong transaction','2026-11-05'),('valuation','v','wrong valuation','2026-11-06')")
 const report=await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-01-01','2026-02-28', 'admin')
 expect(report.transactions[0]).toMatchObject({amountMinor:100,voidReason:'wrong transaction',voidedAt:'2026-11-05'})
 expect(report.valuations[0]).toMatchObject({amountMinor:200,voidReason:'wrong valuation',voidedAt:'2026-11-06'})
 db.close()
})

it('retains voided share events with current correction details for historical reports',async()=>{const db=reportDb();db.exec("CREATE TABLE share_trade_voids(trade_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE share_event_voids(event_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE investment_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE loan_source_voids(source_kind TEXT,source_id TEXT,reason TEXT,created_at TEXT); CREATE TABLE booking_fulfilment_voids(fulfilment_id TEXT,reason TEXT,created_at TEXT)");for(const f of ['0002_domain.sql','0020_booking_history.sql','0015_share_sales.sql','0023_share_trades.sql'])db.exec(readFileSync(`migrations/${f}`,'utf8'));db.exec("INSERT INTO members(id,member_number,full_name,created_by) VALUES ('m','1','Member','admin'); INSERT INTO share_events(id,member_id,event_type,shares,event_date,created_by) VALUES ('s','m','opening',10,'2026-01-01','admin'); INSERT INTO share_event_voids VALUES ('s','entry error','2026-11-05')");const report=await createReportRepository(sqliteAdapter(db) as unknown as D1Database).forPeriod('2026-01-01','2026-02-28', 'admin');expect(report.shareEvents[0]).toMatchObject({shares:10,voidedAt:'2026-11-05',voidReason:'entry error'});db.close()})
