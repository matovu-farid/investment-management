import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {getMapping,updateMapping} from '../../src/lib/policy-mapping.ts'

test('policy form mappings handle special class names and remove cleared choices',()=>{
 for(const name of ['constructor','toString','__proto__','Bonds']){
  const empty:Record<string,string>={}
  assert.equal(getMapping(empty,name),'')
  const chosen=updateMapping(empty,name,'policy-1')
  assert.equal(getMapping(chosen,name),'policy-1')
  assert.deepEqual(Object.entries(chosen),[[name,'policy-1']])
  const cleared=updateMapping(chosen,name,'')
  assert.equal(getMapping(cleared,name),'')
  assert.deepEqual(Object.entries(cleared),[])
  assert.deepEqual(empty,{})
 }
})
test('flags a selected policy when a later-dated range for the same class is recorded',async()=>{
 const {laterPolicyDate}=await import('../../src/lib/policy-mapping.ts')
 const policies=[{id:'old',assetClass:'Bonds',effectiveDate:'2025-01-01'},{id:'new',assetClass:'Bonds',effectiveDate:'2026-01-01'},{id:'future',assetClass:'Bonds',effectiveDate:'2027-01-01'},{id:'other',assetClass:'Equities',effectiveDate:'2026-06-01'}]
 assert.equal(laterPolicyDate(policies[0],policies,'2026-12-31'),'2026-01-01')
 assert.equal(laterPolicyDate(policies[1],policies,'2026-12-31'),null)
 assert.equal(laterPolicyDate(policies[0],policies,'2025-12-31'),null)
})
