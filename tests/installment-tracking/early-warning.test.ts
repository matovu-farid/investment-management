import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {creditEarlyWarning} from '../../src/lib/installment-tracking/early-warning.ts'
const base={asOfDate:'2026-01-01',offset:0,nextOffset:null,totalEligible:2,eligibleCount:2,includedCount:2,unavailableLoanIds:[] as string[],totalMinor:'1000000',unclassifiedMinor:'0',bands:[{risk:'very-risky',amountMinor:'100000'}]}
test('compares very-risky exposure with 10% using exact amounts',()=>{
 assert.equal(creditEarlyWarning(base),'review')
 assert.equal(creditEarlyWarning({...base,bands:[{risk:'very-risky',amountMinor:'99999'}]}),'below')
 assert.equal(creditEarlyWarning({...base,totalMinor:'0',bands:[{risk:'very-risky',amountMinor:'0'}]}),'unavailable')
})
test('withholds the comparison for incomplete or unclassified credit and earlier policy dates',()=>{
 assert.equal(creditEarlyWarning({...base,unavailableLoanIds:['missing'],includedCount:1}),'unavailable')
 assert.equal(creditEarlyWarning({...base,unclassifiedMinor:'1'}),'unavailable')
 assert.equal(creditEarlyWarning({...base,nextOffset:5}),'unavailable')
 assert.equal(creditEarlyWarning({...base,asOfDate:'2025-09-27'}),'not-applicable')
})

test('multi-page captures calculate the threshold from the entire book and withhold incomplete coverage',async()=>{
 const {captureCreditRisk}=await import('../../src/server/credit-risk/capture.ts')
 const {mergeRiskPages}=await import('../../src/lib/installment-tracking/risk-pages.ts')
 const {creditRiskCsv}=await import('../../src/lib/installment-tracking/risk-export.ts')
 let missing=false
 const deps={readState:async()=>({loans:Array.from({length:6},(_,i)=>({id:`loan-${i}`,currency:'UGX',disbursementDate:'2025-01-01'}))}),readBalance:async(id:string)=>missing&&id==='loan-5'?null:{principalMinor:id==='loan-0'?'100':'180',interestMinor:'0'},readRisk:async(id:string)=>id==='loan-0'?'very-risky' as const:'smooth' as const,readPlanTokens:async()=>'unchanged',clock:()=>new Date('2026-08-31T10:00:00Z')}
 const first=await captureCreditRisk('UGX','2026-08-31',deps,{offset:0})
 assert.equal(creditEarlyWarning(first),'unavailable')
 const last=await captureCreditRisk('UGX','2026-08-31',deps,{offset:5,expectedFingerprint:first.fingerprint})
 const result=mergeRiskPages(first,last)
 assert.equal(result.totalMinor,'1000');assert.equal(creditEarlyWarning(result),'review')
 assert.match(creditRiskCsv(result),/At least 10% of the included amount/)
 missing=true
 const missingFirst=await captureCreditRisk('UGX','2026-08-31',deps,{offset:0})
 const missingLast=await captureCreditRisk('UGX','2026-08-31',deps,{offset:5,expectedFingerprint:missingFirst.fingerprint})
 const incomplete=mergeRiskPages(missingFirst,missingLast)
 assert.equal(creditEarlyWarning(incomplete),'unavailable')
 assert.match(creditRiskCsv(incomplete),/Comparison unavailable/)
})
