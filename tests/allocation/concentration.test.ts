import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {screenInvestmentConcentration} from '../../src/lib/allocation-concentration.ts'

test('compares individual selected values to the 45% ceiling using exact fractions',()=>{
 const investments=[{investmentId:'a',name:'A',amountMinor:'4500'},{investmentId:'b',name:'B',amountMinor:'4501'},{investmentId:'c',name:'C',amountMinor:'4499'}]
 const rows=screenInvestmentConcentration({asOf:'2026-01-01',total:'10000',selected:investments})
 assert.ok(rows)
 assert.deepEqual(rows.map(r=>r.comparison),['within','above','within'])
 assert.deepEqual(rows.map(r=>r.basisPoints),['4500','4501','4499'])
 assert.equal(screenInvestmentConcentration({asOf:'2026-01-01',total:'1000000',selected:[{investmentId:'round',name:'Round',amountMinor:'450001'}]})?.[0].comparison,'above')
 assert.equal(screenInvestmentConcentration({asOf:'2026-01-01',total:'1000000',selected:[{investmentId:'round',name:'Round',amountMinor:'450001'}]})?.[0].basisPoints,'4500')
 assert.equal(screenInvestmentConcentration({asOf:'2025-09-27',total:'10000',selected:investments}),null)
 assert.throws(()=>screenInvestmentConcentration({asOf:'2026-01-01',total:'0',selected:investments}),/total/i)
})
