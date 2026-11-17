import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {parseAcknowledgmentSearch} from '../../src/lib/acknowledgment-search.ts'
test('malformed acknowledgment links are handled without throwing before authentication',()=>{
 assert.deepEqual(parseAcknowledgmentSearch({}),{kind:null,id:''})
 assert.deepEqual(parseAcknowledgmentSearch({kind:'repayment',id:'abc'}),{kind:'repayment',id:'abc'})
 for(const input of [{kind:'other',id:'a'},{kind:'repayment',id:''},{kind:'disbursement',id:'a'.repeat(129)},{kind:'repayment',id:['a']}])assert.deepEqual(parseAcknowledgmentSearch(input),{kind:null,id:''})
})
