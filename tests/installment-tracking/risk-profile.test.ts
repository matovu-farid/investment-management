import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { summarizeCreditRisk } from '../../src/lib/installment-tracking/risk-profile.ts'

test('summarizes provisional balances by risk without hiding unknown loans',()=>{
 const result=summarizeCreditRisk('UGX',[
  {loanId:'a',currency:'UGX',risk:'mild',principalMinor:'900',interestMinor:'100'},
  {loanId:'b',currency:'UGX',risk:'unknown',principalMinor:'500',interestMinor:'0'},
  {loanId:'c',currency:'UGX',risk:'very-risky',principalMinor:'500',interestMinor:'0'},
 ])
 assert.equal(result.totalMinor,'2000')
 assert.deepEqual(result.bands.find(b=>b.risk==='mild'),{risk:'mild',loanCount:1,amountMinor:'1000',basisPoints:'5000'})
 assert.deepEqual(result.bands.find(b=>b.risk==='unknown'),{risk:'unknown',loanCount:1,amountMinor:'500',basisPoints:'2500'})
 assert.equal(result.unclassifiedMinor,'500')
})
test('uses exact arithmetic, rejects duplicate and mixed-currency sources, and handles zero totals',()=>{
 const one={loanId:'a',currency:'UGX',risk:'smooth' as const,principalMinor:'9007199254740993',interestMinor:'1'}
 assert.equal(summarizeCreditRisk('UGX',[one]).totalMinor,'9007199254740994')
 assert.throws(()=>summarizeCreditRisk('UGX',[one,one]),/duplicate/i)
 assert.throws(()=>summarizeCreditRisk('USD',[one]),/currency/i)
 assert.throws(()=>summarizeCreditRisk('UGX',[{...one,principalMinor:'-1'}]),/amount/i)
 assert.equal(summarizeCreditRisk('UGX',[]).bands[0].basisPoints,null)
})
