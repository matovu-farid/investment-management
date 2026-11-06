import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { addPolicyTarget, listPolicyTargets, type PolicyTarget } from '../../src/server/policy/service.ts'
const key='fa45be4c-7c98-48a5-a174-26ad1f5706ac'
const valid={requestKey:key,assetClass:'Bonds',effectiveDate:'2026-01-01',minBasisPoints:'1000',maxBasisPoints:'3500',targetBasisPoints:'',source:'Board policy p. 16',notes:''}
function repo(role='admin') { return {roleFor:async()=>role,list:async()=>[],create:async (v:PolicyTarget)=>v} }
test('an admin records a dated allocation range with its source',async()=>{
 const result=await addPolicyTarget(repo(),'user',valid) as {minBasisPoints:number;maxBasisPoints:number;source:string}
 assert.equal(result.minBasisPoints,1000); assert.equal(result.maxBasisPoints,3500); assert.equal(result.source,'Board policy p. 16')
})
test('unlinked and non-admin users cannot read or write policy',async()=>{
 await assert.rejects(listPolicyTargets(repo('member'), 'user'),/unauthorized/i)
 await assert.rejects(addPolicyTarget(repo(), null,valid),/unauthorized/i)
})
test('invalid dates, percentages and missing source are rejected',async()=>{
 for(const patch of [{effectiveDate:'2026-02-30'},{minBasisPoints:'3501'},{maxBasisPoints:'10001'},{targetBasisPoints:'4000'},{source:''}]) await assert.rejects(addPolicyTarget(repo(),'user',{...valid,...patch}))
})
