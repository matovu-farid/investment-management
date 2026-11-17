import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { planSaleAllocation } from '../../src/lib/share-sale-allocation.ts'

test('plans first-come allocations, breaks same-day ties by ID, and permits partial fills', () => {
 const result=planSaleAllocation(10,[{id:'b',date:'2026-01-02',shares:8},{id:'a',date:'2026-01-02',shares:4},{id:'c',date:'2026-01-03',shares:3}])
 assert.deepEqual(result.rows.map(r=>[r.id,r.allocated]),[['a',4],['b',6],['c',0]])
 assert.equal(result.remaining,0)
})
test('reports remaining supply and rejects invalid or repeated requests', () => {
 assert.equal(planSaleAllocation(10,[{id:'a',date:'2026-01-01',shares:3}]).remaining,7)
 assert.throws(()=>planSaleAllocation(10,[{id:'a',date:'2026-02-30',shares:3}]))
 assert.throws(()=>planSaleAllocation(10,[{id:'a',date:'2026-01-01',shares:3},{id:'a',date:'2026-01-02',shares:2}]))
 assert.throws(()=>planSaleAllocation(10,[{id:'a',date:'2026-01-01',shares:0}]))
})
test('planning requires an explicitly reviewed remaining quantity within the original request',async()=>{
 const {reviewedSaleShares}=await import('../../src/lib/share-sale-allocation.ts')
 assert.equal(reviewedSaleShares('4',10),4)
 for(const value of ['', '0', '-1', '4.5', '11', '9007199254740992'])assert.throws(()=>reviewedSaleShares(value,10),/available/i)
 assert.equal(planSaleAllocation(reviewedSaleShares('4',10),[{id:'a',date:'2026-01-01',shares:8}]).rows[0].allocated,4)
})
