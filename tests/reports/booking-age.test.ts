import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {bookingAgeReview} from '../../src/lib/booking-age.ts'
test('reviews recorded remainders at the 30-calendar-day threshold',()=>{
 const booking={bookingId:'b',member:'M',requestedDate:'2026-01-01',currency:'UGX',storedStatus:'waiting',remainingMinor:'100'}
 assert.deepEqual(bookingAgeReview(booking,'2026-01-30'),{...booking,elapsedDays:29,daysToRecordedCompletion:null,review:'Under 30 days; review remainder'})
 assert.equal(bookingAgeReview(booking,'2026-01-31').review,'30+ days; review remainder')
 assert.equal(bookingAgeReview({...booking,remainingMinor:'0'},'2026-02-01').review,'Completion date unavailable')
 assert.equal(bookingAgeReview({...booking,requestedDate:'2026-02-30'},'2026-03-01').review,'Date unavailable')
 assert.equal(bookingAgeReview({...booking,requestedDate:'2025-01-01'},'2025-08-01').review,'Policy date not reached')
})
test('distinguishes recorded completion at and after 30 days',()=>{
 const complete={bookingId:'b',member:'M',requestedDate:'2026-01-01',currency:'UGX',storedStatus:'closed',remainingMinor:'0',completedDate:'2026-01-31'}
 const timely=bookingAgeReview(complete,'2026-02-05')
 assert.equal(timely.daysToRecordedCompletion,30);assert.equal(timely.review,'Recorded completion within 30 days')
 const late=bookingAgeReview({...complete,completedDate:'2026-02-01'},'2026-02-05')
 assert.equal(late.daysToRecordedCompletion,31);assert.equal(late.review,'Recorded completion after 30 days')
 assert.equal(bookingAgeReview({...complete,completedDate:'2026-02-30'},'2026-03-05').review,'Completion date unavailable')
 assert.equal(bookingAgeReview({...complete,completedDate:'2026-02-07'},'2026-02-05').review,'Completion date unavailable')
})
test('completion lookup uses a booking and date index',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),{readFileSync}=await import('node:fs'),db=new DatabaseSync(':memory:')
 db.exec('CREATE TABLE credit_booking_fulfilments(id TEXT, booking_id TEXT, fulfilment_date TEXT, amount_minor INTEGER)')
 db.exec(readFileSync('migrations/0098_booking_fulfilment_date_index.sql','utf8'))
 const plan=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM credit_booking_fulfilments WHERE booking_id=? AND fulfilment_date<=?').all('b','2026-01-31')
 assert.match(JSON.stringify(plan),/booking_fulfilments_by_booking_date/);db.close()
})
test('summarizes recorded request timing without treating unknown cases as successes',async()=>{
 const {summarizeBookingAge}=await import('../../src/lib/booking-age.ts')
 const base={bookingId:'b',member:'M',requestedDate:'2026-01-01',currency:'UGX',storedStatus:'waiting',remainingMinor:'100'}
 const rows=[bookingAgeReview(base,'2026-01-31'),bookingAgeReview({...base,remainingMinor:'0',completedDate:'2026-01-31'},'2026-02-01'),bookingAgeReview({...base,remainingMinor:'0',completedDate:'2026-02-01'},'2026-02-05'),bookingAgeReview({...base,remainingMinor:'0'},'2026-02-05')]
 assert.deepEqual(summarizeBookingAge(rows),{total:4,completedWithin30:1,completedAfter30:1,remainderUnder30:0,remainder30OrMore:1,notClassified:1})
})
