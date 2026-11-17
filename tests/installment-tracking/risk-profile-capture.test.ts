import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { captureCreditRisk } from '../../src/server/credit-risk/capture.ts'
import { mergeRiskPages } from '../../src/lib/installment-tracking/risk-pages.ts'

test('captures all eligible loans and reports unavailable balances and unknown schedules',async()=>{
 const state={loans:[{id:'a',currency:'UGX',disbursementDate:'2025-01-01'},{id:'b',currency:'UGX',disbursementDate:'2025-01-01'},{id:'c',currency:'UGX',disbursementDate:'2025-01-01'},{id:'later',currency:'UGX',disbursementDate:'2027-01-01'},{id:'usd',currency:'USD',disbursementDate:'2025-01-01'}],revision:'one'}
 const deps={readState:async()=>state,readBalance:async(id:string)=>{if(id==='c')return null;return {principalMinor:'900',interestMinor:'100'}},readRisk:async(id:string)=>id==='a'?'mild' as const:'unknown' as const,readPlanTokens:async()=>'same',clock:()=>new Date('2026-08-31T10:00:00Z')}
 const result=await captureCreditRisk('UGX','2026-08-31',deps)
 assert.equal(result.eligibleCount,3);assert.equal(result.includedCount,2);assert.deepEqual(result.unavailableLoanIds,['c']);assert.equal(result.totalMinor,'2000');assert.equal(result.unclassifiedMinor,'1000')
})
test('refuses changing sources and duplicate loan identifiers',async()=>{
 let calls=0;const deps={readState:async()=>({loans:[{id:'a',currency:'UGX',disbursementDate:'2025-01-01'}],revision:String(++calls)}),readBalance:async()=>({principalMinor:'1',interestMinor:'0'}),readRisk:async()=>'smooth' as const,readPlanTokens:async()=>'same',clock:()=>new Date('2026-08-31T10:00:00Z')}
 await assert.rejects(captureCreditRisk('UGX','2026-08-31',deps),/changed/i)
 await assert.rejects(captureCreditRisk('UGX','2026-08-31',{...deps,readState:async()=>({loans:[{id:'a',currency:'UGX',disbursementDate:'2025-01-01'},{id:'a',currency:'UGX',disbursementDate:'2025-01-01'}]})}),/duplicate/i)
})

test('missing schedule is unknown, and changed schedule or lost access aborts capture',async()=>{
 const state={loans:[{id:'a',currency:'UGX',disbursementDate:'2025-01-01'}]},base={readState:async()=>state,readBalance:async()=>({principalMinor:'10',interestMinor:'0'}),readRisk:async()=>null,readPlanTokens:async()=>'same',clock:()=>new Date('2026-08-31T10:00:00Z')}
 const result=await captureCreditRisk('UGX','2026-08-31',base)
 assert.equal(result.bands.find(b=>b.risk==='unknown')?.amountMinor,'10')
 let reads=0;await assert.rejects(captureCreditRisk('UGX','2026-08-31',{...base,readPlanTokens:async()=>String(++reads)}),/schedule changed/i)
 let states=0;await assert.rejects(captureCreditRisk('UGX','2026-08-31',{...base,readState:async()=>{if(++states===2)throw new Error('Unauthorized');return state}}),/unauthorized/i)
})

test('pages cover the whole book and reject a changed book between pages',async()=>{
 let version='one';const deps={readState:async()=>({loans:Array.from({length:12},(_,i)=>({id:`loan-${String(i).padStart(2,'0')}`,currency:'UGX',disbursementDate:'2025-01-01'})),version}),readBalance:async()=>({principalMinor:'10',interestMinor:'0'}),readRisk:async()=>'mild' as const,readPlanTokens:async()=>'plans',clock:()=>new Date('2026-08-31T10:00:00Z')}
 const first=await captureCreditRisk('UGX','2026-08-31',deps,{offset:0});assert.equal(first.totalEligible,12);assert.equal(first.eligibleCount,5);assert.equal(first.nextOffset,5)
 await assert.rejects(captureCreditRisk('UGX','2026-08-31',deps,{offset:5}),/fingerprint|continuation/i)
 const second=await captureCreditRisk('UGX','2026-08-31',deps,{offset:5,expectedFingerprint:first.fingerprint});assert.equal(second.eligibleCount,5);assert.equal(second.nextOffset,10)
 const third=await captureCreditRisk('UGX','2026-08-31',deps,{offset:10,expectedFingerprint:first.fingerprint});assert.equal(third.eligibleCount,2);assert.equal(third.nextOffset,null)
 assert.throws(()=>mergeRiskPages(first,first),/page|order/i);assert.throws(()=>mergeRiskPages(first,third),/page|order/i)
 const combined=mergeRiskPages(mergeRiskPages(first,second),third);assert.equal(combined.eligibleCount,12);assert.equal(combined.totalMinor,'120');assert.equal(combined.bands.find(b=>b.risk==='mild')?.basisPoints,'10000');assert.throws(()=>mergeRiskPages(first,{...second,fingerprint:'different'}),/changed/i)
 version='two';await assert.rejects(captureCreditRisk('UGX','2026-08-31',deps,{offset:5,expectedFingerprint:first.fingerprint}),/changed/i)
})

test('operational failures abort the profile instead of hiding loans or risks',async()=>{
 const deps={readState:async()=>({loans:[{id:'a',currency:'UGX',disbursementDate:'2025-01-01'}]}),readBalance:async()=>({principalMinor:'10',interestMinor:'0'}),readRisk:async()=>'mild' as const,readPlanTokens:async()=>'same',clock:()=>new Date('2026-08-31T10:00:00Z')}
 await assert.rejects(captureCreditRisk('UGX','2026-08-31',{...deps,readBalance:async()=>{throw new Error('D1 unavailable')}}),/D1 unavailable/)
 await assert.rejects(captureCreditRisk('UGX','2026-08-31',{...deps,readRisk:async()=>{throw new Error('D1 unavailable')}}),/D1 unavailable/)
})

test('a changed reviewed schedule between profile pages invalidates the original capture',async()=>{
 let plan='review-one'
 const deps={readState:async()=>({loans:Array.from({length:6},(_,i)=>({id:`loan-${i}`,currency:'UGX',disbursementDate:'2025-01-01'}))}),readBalance:async()=>({principalMinor:'10',interestMinor:'0'}),readRisk:async()=>'mild' as const,readPlanTokens:async()=>plan,clock:()=>new Date('2026-08-31T10:00:00Z')}
 const first=await captureCreditRisk('UGX','2026-08-31',deps,{offset:0})
 plan='review-two'
 await assert.rejects(captureCreditRisk('UGX','2026-08-31',deps,{offset:5,expectedFingerprint:first.fingerprint}),/changed/i)
})
