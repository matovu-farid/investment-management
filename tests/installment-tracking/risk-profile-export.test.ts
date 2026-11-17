import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {captureCreditRisk} from '../../src/server/credit-risk/capture.ts'
import {creditRiskCsv} from '../../src/lib/installment-tracking/risk-export.ts'
import {mergeRiskPages} from '../../src/lib/installment-tracking/risk-pages.ts'

test('risk export includes coverage, source window, exact balances and protected identifiers',async()=>{
 const deps={readState:async()=>({loans:[{id:'=danger',currency:'UGX',disbursementDate:'2025-01-01'},{id:'covered',currency:'UGX',disbursementDate:'2025-01-01'}]}),readBalance:async(id:string)=>{if(id==='=danger')return null;return {principalMinor:'9007199254740993',interestMinor:'1'}},readRisk:async()=>'unknown' as const,readPlanTokens:async()=>'stable',clock:()=>new Date('2026-08-31T10:00:00Z')}
 const csv=creditRiskCsv(await captureCreditRisk('UGX','2026-08-31',deps))
 assert.match(csv,/10% early-warning screen/);assert.match(csv,/Comparison unavailable/);assert.match(csv,/2026-08-31T10:00:00.000Z/);assert.match(csv,/"Eligible loans","2"/);assert.match(csv,/"Included loans","1"/);assert.match(csv,/"'9007199254740994"/);assert.match(csv,/"'=danger"/);assert.match(csv,/not an approved historical score/i);assert.match(csv,/"Unknown","1"/)
})

test('risk export rejects a partial page even if it is the last page',async()=>{
 const deps={readState:async()=>({loans:Array.from({length:6},(_,i)=>({id:`loan-${i}`,currency:'UGX',disbursementDate:'2025-01-01'}))}),readBalance:async()=>({principalMinor:'1',interestMinor:'0'}),readRisk:async()=>'smooth' as const,readPlanTokens:async()=>'stable',clock:()=>new Date('2026-08-31T10:00:00Z')}
 const first=await captureCreditRisk('UGX','2026-08-31',deps,{offset:0}),last=await captureCreditRisk('UGX','2026-08-31',deps,{offset:5,expectedFingerprint:first.fingerprint})
 assert.throws(()=>creditRiskCsv(first),/incomplete/i);assert.throws(()=>creditRiskCsv(last),/incomplete/i);assert.match(creditRiskCsv(mergeRiskPages(first,last)),/"Eligible loans","6"/)
})
