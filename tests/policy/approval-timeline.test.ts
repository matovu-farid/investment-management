import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {illustrateApprovalPeriods} from '../../src/lib/approval-timeline.ts'
test('illustrates calendar-day periods across month and leap-year boundaries',()=>{
 const rows=illustrateApprovalPeriods('2028-02-27','2028-03-03')
 assert.deepEqual(rows.map(r=>[r.role,r.days,r.date,r.status]),[['General Manager',5,'2028-03-03','due today'],['Board',14,'2028-03-12','upcoming'],['Shareholders',60,'2028-04-27','upcoming']])
 assert.equal(illustrateApprovalPeriods('2026-01-01','2026-01-07')[0].status,'date passed')
 assert.equal(illustrateApprovalPeriods('2026-01-01','2025-12-31')[0].status,'not started')
})
test('rejects invalid, pre-policy and overflowing dates',()=>{
 for(const [start,asOf] of [['2026-02-30','2026-03-01'],['2025-09-27','2026-01-01'],['9999-12-31','9999-12-31'],['2026-01-01','invalid']])assert.throws(()=>illustrateApprovalPeriods(start,asOf),/date/i)
})
