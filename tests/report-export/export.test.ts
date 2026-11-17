import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { csvCell, reportCsv, reportSections } from '../../src/lib/report-export/export.ts'
import type { Report } from '../../src/server/reports/service.ts'

test('CSV quotes separators and neutralizes spreadsheet formula prefixes including whitespace and controls', () => {
  assert.equal(csvCell('normal, "quoted"\ntext'), '"normal, ""quoted""\ntext"')
  for (const value of ['=1+1', ' \t+cmd', '\r-1', '\u0000@cmd']) assert.ok(csvCell(value).startsWith('"\''), value)
  assert.equal(csvCell('9007199254740991'), '"\'9007199254740991"')
  assert.equal(csvCell(null), '""')
})

test('report CSV exports all sections, caveats, full rows and per-currency data', () => {
  const report = { start: '2026-01-01', end: '2026-04-30', members: [{number:'001',name:'=Alice'}], loans: [], repayments: [], bookings: [], bookingSnapshot: [], bookingSnapshotTotals: [{currency:'UGX',requestedMinor:'9007199254740991',fulfilledMinor:'0',remainingMinor:'9007199254740991'},{currency:'USD',requestedMinor:'100',fulfilledMinor:'0',remainingMinor:'100'}], bookingStatusEvents: [], fulfilments: [], investments: [], transactions: [], valuations: [{investment:'Bond',date:'2026-04-01',amountMinor:100,currency:'UGX',basis:'Market',source:'Source, Ltd'}], shareEvents: [], shareTrades: [] } satisfies Report
  const csv=reportCsv(report)
  assert.ok(csv.includes('2026-01-01'))
  assert.ok(csv.includes('2026-04-30'))
  assert.ok(csv.includes('not necessarily actionable demand'))
  assert.ok(csv.includes('"\'=Alice"'))
  assert.ok(csv.includes('"Source, Ltd"'))
  assert.ok(csv.includes('"UGX"') && csv.includes('"USD"'))
  assert.ok(csv.includes('Not captured in this saved report'))
  for(const section of reportSections) assert.ok(csv.includes(`"${section.title}"`), section.title)
})

test('exports cash facts separately with exact amounts, void details and safe spreadsheet cells', () => {
  const report = { start:'2026-01-01', end:'2026-01-31', members:[], loans:[], repayments:[], bookings:[], bookingSnapshot:[], bookingSnapshotTotals:[], bookingStatusEvents:[], fulfilments:[], investments:[], transactions:[], valuations:[], shareEvents:[], shareTrades:[], cashEntries:[{ id:'x', date:'2026-01-01', direction:'payment', amountMinor:'123456789012345678901', currency:'UGX', counterparty:'=example', reference:'r', description:'Office', createdBy:'admin', createdAt:'2026-02-01', voidedAt:'2026-02-03', voidReason:'Correction', voidedBy:'admin' }] } satisfies Report
  const csv = reportCsv(report)
  assert.match(csv, /Other cash receipts and payments/)
  assert.ok(csv.includes('"\'123456789012345678901"'))
  assert.ok(csv.includes('"\'=example"'))
  assert.ok(csv.includes('Correction'))
})

test('fulfilment report exports the linked loan identifier without implying disbursement',()=>{
 const report={start:'2026-01-01',end:'2026-04-30',members:[],loans:[],repayments:[],bookings:[],bookingSnapshot:[],bookingSnapshotTotals:[],bookingStatusEvents:[],fulfilments:[{member:'M',bookingId:'b',loanId:'=loan',requestedDate:'2026-01-01',date:'2026-02-01',amountMinor:20,currency:'UGX',notes:null,voidedAt:null,voidReason:null}],investments:[],transactions:[],valuations:[],shareEvents:[],shareTrades:[]} satisfies Report
 const csv=reportCsv(report)
 assert.match(csv,/"Associated loan ID"/);assert.match(csv,/"'=loan"/);assert.match(csv,/recorded facts/)
})
