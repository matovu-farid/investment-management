import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {equityConcentration} from '../../src/lib/equity-concentration.ts'
test('company and sector thresholds use exact amounts',()=>{
 const positions=[{investmentId:'a',name:'A',company:'A',sector:'One',amountMinor:'250000'},{investmentId:'b',name:'B',company:'B',sector:'One',amountMinor:'150001'},{investmentId:'c',name:'C',company:'C',sector:'Two',amountMinor:'599999'}]
 const result=equityConcentration(positions)
 assert.equal(result.companies.find(x=>x.name==='A')?.comparison,'within')
 assert.equal(result.sectors.find(x=>x.name==='One')?.basisPoints,'4000')
 assert.equal(result.sectors.find(x=>x.name==='One')?.comparison,'above')
 assert.equal(equityConcentration([]).totalMinor,'0')
 assert.equal(equityConcentration([{...positions[0],amountMinor:'0'}]).companies[0].comparison,null)
})
test('identifies a company assigned to multiple sectors for review',()=>{
 const positions=[{investmentId:'a',name:'A',company:'Company',sector:'Banking',amountMinor:'20'},{investmentId:'b',name:'B',company:'Company',sector:'Other',amountMinor:'80'}]
 assert.deepEqual(equityConcentration(positions).inconsistentCompanies,['Company'])
 assert.deepEqual(equityConcentration(positions.map(p=>({...p,sector:'Banking'}))).inconsistentCompanies,[])
})
test('flags potentially identical labels that differ by case or spacing without merging them',async()=>{
 const {equitySimilarLabels}=await import('../../src/lib/equity-concentration.ts')
 const positions=[{investmentId:'a',name:'A',company:'Acme Bank',sector:'Financial Services',amountMinor:'40'},{investmentId:'b',name:'B',company:'ACME  BANK',sector:'financial services',amountMinor:'60'},{investmentId:'c',name:'C',company:'Other',sector:'Health',amountMinor:'0'}]
 assert.deepEqual(equitySimilarLabels(positions),{companies:[['ACME  BANK','Acme Bank']],sectors:[['Financial Services','financial services']]})
 assert.equal(equityConcentration(positions).companies.length,3)
 assert.deepEqual(equitySimilarLabels([positions[0]]),{companies:[],sectors:[]})
})
