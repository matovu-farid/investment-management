import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {salaryPromiseGuide} from '../../src/lib/credit-review/salary-promise.ts'

test('calculates 1.5 percent of issued credit using exact whole minor units',()=>{
 assert.deepEqual(salaryPromiseGuide('60000000','900000'),{minimumMinor:'900000',meetsMinimum:true})
 assert.deepEqual(salaryPromiseGuide('101','1'),{minimumMinor:'2',meetsMinimum:false})
 assert.deepEqual(salaryPromiseGuide('9007199254740993','135107988821115'),{minimumMinor:'135107988821115',meetsMinimum:true})
})
test('rejects zero, negative, decimal and malformed amounts',()=>{
 for(const principal of ['0','-1','2.5','01','', '1e3'])assert.throws(()=>salaryPromiseGuide(principal,'1'))
 for(const promise of ['-1','2.5','01',''])assert.throws(()=>salaryPromiseGuide('100',promise))
 assert.equal(salaryPromiseGuide('100','0').meetsMinimum,false)
})
