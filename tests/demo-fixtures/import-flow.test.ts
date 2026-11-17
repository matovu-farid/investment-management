import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {parseMemberCsv} from '../../src/lib/member-import/csv.ts'
import {parseHoldingCsv} from '../../src/lib/holding-import/csv.ts'
import {parseLendingCsv} from '../../src/lib/lending-import/csv.ts'
import {parseBookingCsv} from '../../src/lib/booking-import/csv.ts'
import {parseBookingFulfilmentCsv} from '../../src/lib/booking-fulfilment-import/csv.ts'
import {parseInvestmentCsv} from '../../src/lib/investment-import/csv.ts'
import {previewMemberImport,importMembers} from '../../src/server/member-import/service.ts'
import {previewHoldingImport,importHoldings} from '../../src/server/holding-import/service.ts'
import {previewLendingImport,importLending} from '../../src/server/lending-import/service.ts'
import {previewBookingImport,importBookings} from '../../src/server/booking-import/service.ts'
import {previewBookingFulfilmentImport,importBookingFulfilments} from '../../src/server/booking-fulfilment-import/service.ts'
import {previewInvestmentImport,importInvestment} from '../../src/server/investment-import/service.ts'
import {createReportRepository} from '../../src/server/reports/repository.ts'
import {reportCsv} from '../../src/lib/report-export/export.ts'
import {previewBoardPacket,saveBoardPacket,listBoardPackets} from '../../src/server/board-packets/service.ts'
import {boardPacketCsv} from '../../src/lib/board-packet-export.ts'

test('fictional import examples connect through to the booking report without posting journals',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Synthetic Admin','demo@example.test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a')`)
 type Stmt={bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 const stmt=(q:string,args:unknown[]=[]):Stmt=>({bind(...v){return stmt(q,v)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){const s=sql.prepare(q);return {results:s.columns().length?s.all(...args as never[]):(s.run(...args as never[]),[])}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args as never[]).changes)}}}})
 const db={prepare:(q:string)=>stmt(q),async batch(stmts:Stmt[]){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database
 const input=(f:string)=>readFileSync('docs/demo-fixtures/'+f,'utf8'),key=()=>crypto.randomUUID()
 const parsed=<T>(r:{rows:T[];errors:string[]})=>{assert.deepEqual(r.errors,[]);return r.rows}
 let p=await previewMemberImport(db,'a',{rows:parsed(parseMemberCsv(input('01-members.csv')))});await importMembers(db,'a',{rows:p.rows,requestKey:key()})
 const holdings=await previewHoldingImport(db,'a',{rows:parsed(parseHoldingCsv(input('02-holdings.csv')))});await importHoldings(db,'a',{rows:holdings.rows,requestKey:key()})
 for(const [kind,file] of [['loan','03-loans.csv'],['repayment','04-repayments.csv']] as const){const preview=await previewLendingImport(db,'a',{kind,rows:parsed(parseLendingCsv(kind,input(file)))});await importLending(db,'a',{kind,rows:preview.rows,requestKey:key()})}
 const bookings=await previewBookingImport(db,'a',{rows:parsed(parseBookingCsv(input('05-bookings.csv')))});await importBookings(db,'a',{rows:bookings.rows,requestKey:key()})
 for(const [kind,file] of [['investment','06-investments.csv'],['valuation','07-valuations.csv']] as const){const preview=await previewInvestmentImport(db,'a',{kind,rows:parsed(parseInvestmentCsv(kind,input(file)))});await importInvestment(db,'a',{kind,rows:preview.rows,requestKey:key()})}
 const fulfilments=await previewBookingFulfilmentImport(db,'a',{rows:parsed(parseBookingFulfilmentCsv(input('08-booking-fulfilments.csv')))});await importBookingFulfilments(db,'a',{rows:fulfilments.rows,requestKey:key()})
 const report=await createReportRepository(db).forPeriod('2026-01-01','2026-08-31','a'),booking=report.bookingSnapshot[0]
 assert.deepEqual([booking.requestedMinor,booking.fulfilledMinor,booking.remainingMinor],['300000','100000','200000'])
 assert.equal(report.bookingAgeReview?.[0].elapsedDays,122);assert.equal(report.bookingAgeReview?.[0].review,'30+ days; review remainder');assert.equal(report.bookingAgeSummary?.[0].remainder30OrMore,1)
 const csv=reportCsv(report);for(const value of ['300000','100000','200000','30+ days; review remainder'])assert.ok(csv.includes(value))
 const packet=await previewBoardPacket(db,'a',{start:'2026-05-01',end:'2026-08-31'})
 assert.equal(packet.activity.data.bookingSnapshot[0].remainingMinor,'200000')
 assert.equal(packet.activity.data.valuations.length,2)
 const packetCsv=boardPacketCsv(packet);assert.match(packetCsv,/DEMO Treasury Investment/);assert.match(packetCsv,/200000/)
 const later=await previewBookingFulfilmentImport(db,'a',{rows:[{sourceRef:'DEMO-FULFIL-LATER',bookingRef:'DEMO-BOOK-001',amountMinor:'50000',fulfilmentDate:'2026-07-01'}]})
 await importBookingFulfilments(db,'a',{rows:later.rows,requestKey:key()})
 await saveBoardPacket(db,'a',{previewId:packet.previewId,requestKey:key()})
 const frozen=(await listBoardPackets(db,'a'))[0].packet
 assert.equal(frozen.activity.data.bookingSnapshot[0].remainingMinor,'200000');assert.equal(frozen.activity.data.bookingAgeReview?.[0].remainingMinor,'200000')
 assert.equal((await createReportRepository(db).forPeriod('2026-05-01','2026-08-31','a')).bookingSnapshot[0].remainingMinor,'150000')
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM journal_entries').get()?.n,0)
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0)
 sql.close()
})
