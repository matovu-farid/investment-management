import test from 'node:test'
import assert from 'node:assert/strict'
import { boardPacketCsv } from '../../src/lib/board-packet-export.ts'
import type { Packet } from '../../src/server/board-packets/service.ts'

test('complete draft export includes independent capture windows, omissions and safely escaped component data', () => {
  const activity = { start: '2026-01-01', end: '2026-04-30', members: [{ number: '0001', name: '=formula' }], loans: [], repayments: [], bookings: [], bookingSnapshot: [], bookingSnapshotTotals: [], bookingStatusEvents: [], fulfilments: [], investments: [], transactions: [], valuations: [], shareEvents: [], shareTrades: [] }
  const p: Packet = { start: activity.start, end: activity.end, omissions: ['Budget omitted'], activity: { capturedFrom: '2026-05-01 10:00:00', capturedTo: '2026-05-01 10:00:01', data: activity }, lending: { capturedFrom: '2026-05-01 10:00:02', capturedTo: '2026-05-01 10:00:03', data: { asOf: activity.end, snapshotAt: '2026-05-01 10:00:03', loans: [], fundObservations: [], csv: '\ufeff"Lending sentinel"\r\n' } }, trialBalance: { capturedFrom: '2026-05-01 10:00:04', capturedTo: '2026-05-01 10:00:05', data: { asOf: activity.end, accounts: [{ accountId: 'a', code: '0007', name: 'Cash', currency: 'UGX', debits: '90071992547409930', credits: '0', netDebit: '90071992547409930', netCredit: '0' }], totals: [] } } }
  const csv = boardPacketCsv(p)
  assert.ok(csv.startsWith('\ufeff'))
  assert.equal((csv.match(/\ufeff/g) ?? []).length, 1)
  assert.ok(csv.includes('Not captured in this saved report'), 'legacy packets must not portray uncaptured cash as an empty register')
  for (const expected of ['"Period start","2026-01-01"', '"Omitted","Budget omitted"', '2026-05-01 10:00:01', '2026-05-01 10:00:03', '2026-05-01 10:00:05', '"Lending sentinel"', '"\'=formula"', '"\'90071992547409930"']) assert.ok(csv.includes(expected), expected)
})

test('includes selected allocation and budget comparisons with their independent capture times', () => {
  const activity = { start: '2026-01-01', end: '2026-04-30', members: [], loans: [], repayments: [], bookings: [], bookingSnapshot: [], bookingSnapshotTotals: [], bookingStatusEvents: [], fulfilments: [], investments: [], transactions: [], valuations: [], shareEvents: [], shareTrades: [] }
  const section = { capturedFrom: '2026-05-01 10:00:00', capturedTo: '2026-05-01 10:00:01' }
  const packet = { start: activity.start, end: activity.end, omissions: [], activity: { ...section, data: activity }, lending: { ...section, data: { asOf: activity.end, snapshotAt: section.capturedTo, loans: [], fundObservations: [], csv: 'lending' } }, trialBalance: { ...section, data: { asOf: activity.end, accounts: [], totals: [] } }, allocation: { ...section, selection: {currency:'UGX',asOf:activity.end,selected:{},mappings:{}}, data: { snapshotAt: section.capturedTo, asOf: activity.end, currency: 'UGX', total: '100', classes: [], selected: [], excluded: [] } }, budgets: { ...section, selection: [{ budgetId:'b',transactionIds:[] }], data: [{ snapshotAt: section.capturedTo, budget: {id:'b',category:'=Budget',periodStart:activity.start,periodEnd:activity.end,currency:'UGX',amountMinor:'100',source:'source'}, selectedTotal:'0',difference:'-100',selected:[],excluded:[] }] } }
  packet.allocation.data.classes.push({assetClass:'Bonds', amountMinor:'100',basisPoints:'10000',comparison:'within',policy:{id:'policy-123',assetClass:'Bonds',effectiveDate:'2026-01-01',minBasisPoints:0,maxBasisPoints:10000,targetBasisPoints:5000,source:'source'}} as never)
  const legacyCsv = boardPacketCsv(packet as unknown as Packet)
  assert.ok(legacyCsv.includes('Cash activity not captured in this comparison'));assert.ok(legacyCsv.includes('"Comparison basis","Investment transactions"'))
  Object.assign(packet.budgets.data[0], {comparisonBasis:'cash_receipts', selectedTotal:'90071992547409930',difference:'90071992547409830',cash:{selected:[{id:'c',entryDate:'2026-01-01',direction:'receipt',currency:'UGX',amountMinor:'90071992547409930',counterparty:'=unsafe',reference:'ref',description:'evidence'}],excluded:[],receiptsTotal:'90071992547409930',paymentsTotal:'0'}})
  const csv = boardPacketCsv(packet as unknown as Packet)
  assert.ok(csv.includes('"Comparison basis","Cash receipts"'));assert.ok(csv.includes('Cash receipts and payments'));assert.ok(csv.includes("'=unsafe"));assert.ok(csv.includes("'90071992547409930"))
  for (const expected of ['RNIG portfolio allocation worksheet', 'RNIG budget comparison worksheet', "'=Budget", '2026-05-01 10:00:01', '"Selected policy ID"', '"policy-123"']) assert.ok(csv.includes(expected), expected)
})

test('exports every selected statement working paper and capture window', () => {
  const section = { capturedFrom: '2026-05-01 10:00:00', capturedTo: '2026-05-01 10:00:01' }
  const activity = { start: '2026-01-01', end: '2026-04-30', members: [], loans: [], repayments: [], bookings: [], bookingSnapshot: [], bookingSnapshotTotals: [], bookingStatusEvents: [], fulfilments: [], investments: [], transactions: [], valuations: [], shareEvents: [], shareTrades: [] }
  const packet = { start: activity.start, end: activity.end, omissions: [], activity: { ...section, data: activity }, lending: { ...section, data: { asOf: activity.end, snapshotAt: section.capturedTo, loans: [], fundObservations: [], csv: 'lending' } }, trialBalance: { ...section, data: { asOf: activity.end, accounts: [], totals: [] } }, statements: [{ capturedFrom: '2026-05-02 11:00:00', capturedTo: '2026-05-02 11:00:01', data: { csv: '\ufeff"Mapped account"\r\n"Unmapped account"' } }, { ...section, data: { csv: '\ufeff"Second worksheet"' } }] }
  const csv = boardPacketCsv(packet as unknown as Packet)
  for (const expected of ['Statement working paper 1', '2026-05-02 11:00:00', '2026-05-02 11:00:01', 'Mapped account', 'Unmapped account', 'Statement working paper 2', 'Second worksheet']) assert.ok(csv.includes(expected), expected)
  assert.equal((csv.match(/\ufeff/g) ?? []).length, 1)
})
test('exports selected sale requests and dated history with escaped member data',()=>{
 const section={capturedFrom:'2026-05-01 10:00:00',capturedTo:'2026-05-01 10:00:01'}
 const activity={start:'2026-01-01',end:'2026-04-30',members:[],loans:[],repayments:[],bookings:[],bookingSnapshot:[],bookingSnapshotTotals:[],bookingStatusEvents:[],fulfilments:[],investments:[],transactions:[],valuations:[],shareEvents:[],shareTrades:[]}
 const packet={start:activity.start,end:activity.end,omissions:[],activity:{...section,data:activity},lending:{...section,data:{asOf:activity.end,snapshotAt:section.capturedTo,loans:[],fundObservations:[],csv:'lending'}},trialBalance:{...section,data:{asOf:activity.end,accounts:[],totals:[]}},sales:{...section,data:{requests:[{id:'sale',memberId:'member',memberName:'=Seller',memberNumber:'001',shares:5,askingPriceMinor:100,currency:'UGX',requestDate:'2026-01-02',deadlineDate:null,notes:'source'}],interests:[{id:'interest',saleId:'sale',memberId:'buyer',memberName:'Buyer',memberNumber:'002',interestDate:'2026-01-03',shares:2,notes:'bid',provenance:'member'}],statuses:[{id:'status',saleId:'sale',statusDate:'2026-01-04',status:'announced',newDeadlineDate:null,notes:'event'}]}}}
 const csv=boardPacketCsv(packet as Packet);for(const expected of ['Share-sale requests','2026-05-01 10:00:00',"'=Seller",'interest','announced','Buyer','Provenance'])assert.ok(csv.includes(expected),expected)
})

test('calculated lending aggregate export includes exact currency totals and omission counts',()=>{
 const activity={start:'2020-01-01',end:'2020-12-31',members:[]} as unknown as Packet['activity']['data'],section={capturedFrom:'2020-12-31 12:00:00',capturedTo:'2020-12-31 12:00:01'}
 const packet={start:activity.start,end:activity.end,omissions:[],activity:{...section,data:activity},lending:{...section,data:{asOf:activity.end,snapshotAt:section.capturedTo,loans:[],fundObservations:[],csv:'lending'}},trialBalance:{...section,data:{asOf:activity.end,accounts:[],totals:[]}},calculatedLending:{...section,data:{asOf:activity.end,eligible:3,included:2,omitted:{unconfigured:1,pendingRepayments:0,unavailable:0},totals:[{currency:'UGX',principalMinor:'90071992547409930',interestMinor:'12'}]}}} as unknown as Packet
 const csv=boardPacketCsv(packet);for(const part of ['Provisional calculated lending totals',"'90071992547409930",'Omitted: unconfigured','UGX'])assert.ok(csv.includes(part),part)
})
