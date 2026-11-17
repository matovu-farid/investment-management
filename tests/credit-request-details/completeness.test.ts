import {test} from 'node:test'
import assert from 'node:assert/strict'
import {missingCreditRequestFields} from '../../src/lib/credit-request-completeness.ts'
test('identifies missing protocol details without treating whitespace as recorded',()=>{
 assert.deepEqual(missingCreditRequestFields({purpose:'investment',repaymentPromise:' ',interestOption:'2% per 60 days',duration:'12 months',receivingAccount:''}),['Repayment promise','Preferred receiving account'])
 assert.deepEqual(missingCreditRequestFields({purpose:'x',repaymentPromise:'x',interestOption:'x',duration:'x',receivingAccount:'x'}),[])
})

test('detects changes from the last saved request without ignoring meaningful whitespace',async()=>{
 const {creditRequestChanged}=await import('../../src/lib/credit-request-completeness.ts')
 const saved={purpose:'investment',repaymentPromise:'monthly',interestOption:'2%',duration:'12 months',receivingAccount:'account'}
 assert.equal(creditRequestChanged(saved,{...saved}),false)
 assert.equal(creditRequestChanged(saved,{...saved,purpose:'changed'}),true)
 assert.equal(creditRequestChanged(saved,{...saved,purpose:' investment'}),true)
})
