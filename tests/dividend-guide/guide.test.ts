import {test} from 'node:test'
import assert from 'node:assert/strict'
import {dividendIllustration} from '../../src/lib/dividend-illustration.ts'
test('compares both documented percentages using exact whole-unit arithmetic',()=>{
 assert.deepEqual(dividendIllustration('277734123'),{ips:'83320236',board:'111093649'})
 assert.deepEqual(dividendIllustration('1'),{ips:'0',board:'0'})
 assert.deepEqual(dividendIllustration('0'),{ips:'0',board:'0'})
})
test('rejects invalid and unsafe amounts',()=>{
 for(const value of ['','-1','1.5','01','9007199254740992','abc'])assert.throws(()=>dividendIllustration(value))
})
