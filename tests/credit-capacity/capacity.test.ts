import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {calculateCapacity} from '../../src/server/credit-capacity/calculate.ts'
import {compareProposedCredit} from '../../src/lib/credit-capacity-proposal.ts'
const base={memberId:'m',asOf:'2026-01-31',observationId:'o',valueId:'v',limitBasisPoints:5000,review:{termChanges:[],holdings:[{id:'o',kind:'individual',observedDate:'2026-01-01',shares:'3',voidedAt:null}],holdingPublications:[{id:'h',observationId:'o',withdrawnAt:null}],shareValues:[{id:'v',holdingPublicationId:'h',kind:'individual',shares:'3',observedDate:'2026-01-01',priceDate:'2026-01-01',priceMinor:'5',currency:'UGX',withdrawnAt:null,holdingWithdrawnAt:null}]},billing:{loans:[],configs:[],repayments:[],events:[],revisions:[],openings:[]}}
test('proposed credit uses the rounded first-time limit after covered existing loans',()=>{
 const loan=(id:string)=>({id,memberId:'m',currency:'UGX',disbursementDate:'2026-01-31'})
 const config=(loanId:string)=>({loanId,principalMinor:'2',disbursementDate:'2026-01-31',rateBasisPoints:200,periodDays:60})
 const billing={...base.billing,loans:[loan('a'),loan('b')],configs:[config('a'),config('b')],revisions:[{loanId:'a',revision:1},{loanId:'b',revision:1}]}
 const result=calculateCapacity({...base,billing} as never)
 assert.equal(result.limitMinor,'7');assert.equal(result.exposureMinor,'4');assert.equal(result.remainingMinor,'3')
 assert.deepEqual(compareProposedCredit({limitMinor:result.limitMinor,exposureMinor:result.exposureMinor,proposalMinor:'3',coverageComplete:result.remainingMinor!==null}),{projectedExposureMinor:'7',remainingMinor:'0',excessMinor:'0'})
 assert.deepEqual(compareProposedCredit({limitMinor:result.limitMinor,exposureMinor:result.exposureMinor,proposalMinor:'4',coverageComplete:result.remainingMinor!==null}),{projectedExposureMinor:'8',remainingMinor:'0',excessMinor:'1'})
 const incomplete=calculateCapacity({...base,billing:{...billing,loans:[...billing.loans,loan('missing')]}} as never)
 assert.throws(()=>compareProposedCredit({limitMinor:incomplete.limitMinor,exposureMinor:incomplete.exposureMinor,proposalMinor:'1',coverageComplete:incomplete.remainingMinor!==null}),/coverage/i)
})
test('rounds limit down, uses exact integers, and suppresses incomplete capacity',()=>{const result=calculateCapacity(base as never);assert.equal(result.holdingValueMinor,'15');assert.equal(result.limitMinor,'7');assert.equal(result.remainingMinor,'7');const more={...base,billing:{...base.billing,loans:[{id:'l',memberId:'m',currency:'UGX',disbursementDate:'2025-01-01'}]}};assert.equal(calculateCapacity(more as never).remainingMinor,null);assert.equal(calculateCapacity(more as never).omitted.unconfigured,1);assert.throws(()=>calculateCapacity({...base,review:{...base.review,holdings:[{...base.review.holdings[0],voidedAt:'yes'}]}} as never),/unavailable/i);assert.throws(()=>calculateCapacity({...base,asOf:'2025-12-31'} as never),/date/i)})
test('covers multiple loans exactly and blocks other currencies and pending repayments',()=>{const loan=(id:string,currency='UGX')=>({id,memberId:'m',currency,disbursementDate:'2026-01-31'}),config=(loanId:string)=>({loanId,principalMinor:'2',disbursementDate:'2026-01-31',rateBasisPoints:200,periodDays:60});const billing={...base.billing,loans:[loan('a'),loan('b')],configs:[config('a'),config('b')],revisions:[{loanId:'a',revision:1},{loanId:'b',revision:1}]};const result=calculateCapacity({...base,billing} as never);assert.equal(result.included,2);assert.equal(result.exposureMinor,'4');assert.equal(result.remainingMinor,'3');const foreign=calculateCapacity({...base,billing:{...billing,loans:[...billing.loans,loan('c','USD')]}} as never);assert.equal(foreign.omitted.otherCurrency,1);assert.equal(foreign.remainingMinor,null);const pending=calculateCapacity({...base,billing:{...billing,repayments:[{id:'r',loanId:'a',date:'2026-01-31',amountMinor:'1',voided:0}]}} as never);assert.equal(pending.omitted.pendingRepayments,1);assert.equal(pending.remainingMinor,null);assert.throws(()=>calculateCapacity({...base,review:{...base.review,shareEvents:[{kind:'individual',voidedAt:null,eventDate:'2026-01-01'}]}} as never),/stale/i)})
test('capacity uses reviewed rate changes and ignores corrected changes',()=>{const billing={...base.billing,loans:[{id:'l',memberId:'m',currency:'UGX',disbursementDate:'2026-01-01'}],configs:[{loanId:'l',principalMinor:'180000',disbursementDate:'2026-01-01',rateBasisPoints:200,periodDays:60}],revisions:[{loanId:'l',revision:2}],rateChanges:[{loanId:'l',effectiveDate:'2026-01-16',rateBasisPoints:500,periodDays:180,voidedAt:null}]};assert.equal(calculateCapacity({...base,billing} as never).exposureMinor,'181650');billing.rateChanges[0].voidedAt='corrected' as never;assert.equal(calculateCapacity({...base,billing} as never).exposureMinor,'181800')})

test('capacity is withheld when a posted repayment split or journal is inconsistent',()=>{
 const billing={...base.billing,loans:[{id:'l',memberId:'m',currency:'UGX',disbursementDate:'2026-01-01'}],configs:[{loanId:'l',principalMinor:'100',disbursementDate:'2026-01-01',rateBasisPoints:200,periodDays:60}],revisions:[{loanId:'l',revision:2}],repayments:[{id:'r',loanId:'l',date:'2026-01-01',amountMinor:'10',voided:0}],events:[{id:'e',loanId:'l',repaymentId:'r',repaymentJournalId:'j',principalMinor:'10',interestMinor:'0',unappliedMinor:'0'}]}
 const valid=calculateCapacity({...base,billing,validJournalIds:['e']} as never)
 assert.equal(valid.included,1)
 const bad=calculateCapacity({...base,billing:{...billing,events:[{...billing.events[0],principalMinor:'9'}]},validJournalIds:['e']} as never)
 assert.equal(bad.remainingMinor,null);assert.equal(bad.omitted.unavailable,1)
 const missing=calculateCapacity({...base,billing,validJournalIds:[]} as never)
 assert.equal(missing.remainingMinor,null);assert.equal(missing.omitted.unavailable,1)
})
test('independent-director exposure can be calculated without a holding or share price',async()=>{
 const {calculateMemberExposure}=await import('../../src/server/credit-capacity/calculate.ts')
 const loan={id:'l',memberId:'m',currency:'UGX',disbursementDate:'2026-01-31'}
 const config={loanId:'l',principalMinor:'4000000',disbursementDate:'2026-01-31',rateBasisPoints:200,periodDays:60}
 const billing={...base.billing,loans:[loan],configs:[config],revisions:[{loanId:'l',revision:1}]}
 const exposure=calculateMemberExposure({memberId:'m',asOf:'2026-01-31',currency:'UGX',review:{termChanges:[]},billing} as never)
 assert.equal(exposure.exposureMinor,'4000000');assert.equal(exposure.complete,true);assert.equal(exposure.included,1)
 const missing=calculateMemberExposure({memberId:'m',asOf:'2026-01-31',currency:'UGX',review:{termChanges:[]},billing:{...billing,configs:[]}} as never)
 assert.equal(missing.complete,false);assert.equal(missing.omitted.unconfigured,1)
})
