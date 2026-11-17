import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {correctPolicyTarget,listPolicyCorrections} from '../../src/server/policy/corrections.ts'
import {createPolicyRepository} from '../../src/server/policy/repository.ts'
import {getAllocationData} from '../../src/server/allocation/service.ts'

function fixture(){
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@test',1,1),('b','Other','b@test',1,1);INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a');INSERT INTO policy_targets(id,asset_class,effective_date,min_basis_points,max_basis_points,source,created_by) VALUES('p','Bonds','2025-09-28',1000,2500,'Original','a')`)
 type Stmt={bind:(...v:unknown[])=>Stmt;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>;run:()=>Promise<unknown>}
 const stmt=(q:string,args:unknown[]=[]):Stmt=>({bind(...v){return stmt(q,v)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args as never[]).changes)}}}})
 return {sql,db:{prepare:(q:string)=>stmt(q),async batch(stmts:Stmt[]){return Promise.all(stmts.map(s=>s.all()))}} as unknown as D1Database}
}
const request={policyId:'p',expectedCorrectionId:null,expectedMinBasisPoints:1000,expectedMaxBasisPoints:2500,expectedTargetBasisPoints:null,expectedSource:'Original',expectedNotes:null,minBasisPoints:1200,maxBasisPoints:2600,targetBasisPoints:null,source:'Reviewed source',notes:'Clarified',reason:'Correct transcription',requestKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
test('correction preserves history and exposes revised values without changing the original record',async()=>{
 const {sql,db}=fixture();await assert.rejects(correctPolicyTarget(db,'b',request),/unauthorized/i)
 const first=await correctPolicyTarget(db,'a',request);assert.equal((await correctPolicyTarget(db,'a',request)).id,first.id)
 const rows=await createPolicyRepository(db).list('a');assert.equal(rows[0].minBasisPoints,1200);assert.equal(rows[0].maxBasisPoints,2600);assert.equal(rows[0].source,'Reviewed source')
 assert.equal((await getAllocationData(db,'a')).policies.find(p=>p.id==='p')?.minBasisPoints,1200)
 assert.equal(sql.prepare("SELECT min_basis_points FROM policy_targets WHERE id='p'").get()?.min_basis_points,1000)
 const history=await listPolicyCorrections(db,'a','p');assert.equal(history.length,1);assert.equal(history[0].reason,'Correct transcription')
 await assert.rejects(correctPolicyTarget(db,'a',{...request,requestKey:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),/changed|stale/i)
 await assert.rejects(correctPolicyTarget(db,'a',{...request,maxBasisPoints:3000}),/different/i)
 assert.throws(()=>sql.exec("UPDATE policy_target_corrections SET reason='changed'"),/immutable/i)
 assert.throws(()=>sql.exec("DELETE FROM policy_target_corrections"),/immutable/i)
 assert.throws(()=>sql.exec("UPDATE policy_targets SET min_basis_points=5 WHERE id='p'"),/immutable/i)
 assert.throws(()=>sql.exec("DELETE FROM policy_targets WHERE id='p'"),/immutable/i)
 const next=await correctPolicyTarget(db,'a',{...request,expectedCorrectionId:first.id,expectedMinBasisPoints:1200,expectedMaxBasisPoints:2600,expectedSource:'Reviewed source',expectedNotes:'Clarified',minBasisPoints:1300,maxBasisPoints:2700,requestKey:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'})
 assert.notEqual(next.id,first.id);assert.equal((await createPolicyRepository(db).list('a'))[0].minBasisPoints,1300);assert.equal((await listPolicyCorrections(db,'a','p')).length,2)
 await assert.rejects(correctPolicyTarget(db,'a',{...request,expectedCorrectionId:first.id,expectedMinBasisPoints:1200,expectedMaxBasisPoints:2600,expectedSource:'Reviewed source',expectedNotes:'Clarified',requestKey:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}),/stale/i)
 sql.close()
})
test('invalid range and stale snapshots cannot be applied',async()=>{
 const {sql,db}=fixture()
 await assert.rejects(correctPolicyTarget(db,'a',{...request,minBasisPoints:3000}),/range/i)
 await assert.rejects(correctPolicyTarget(db,'a',{...request,expectedSource:'Other'}),/changed/i)
 assert.throws(()=>sql.exec("INSERT INTO policy_target_corrections(id,policy_id,old_min,old_max,old_source,new_min,new_max,new_source,reason,created_by,request_key) VALUES('x','p',1000,2500,'Original',1200,2600,'Forged','forged','b','x')"),/unauthorized/i)
 assert.equal(sql.prepare('SELECT count(*) AS n FROM policy_target_corrections').get()?.n,0)
 sql.close()
})
test('class and date corrections preserve history and prevent active duplicates',async()=>{
 const {sql,db}=fixture()
 const change={...request,expectedAssetClass:'Bonds',expectedEffectiveDate:'2025-09-28',assetClass:'Treasuries',effectiveDate:'2025-10-01'}
 const first=await correctPolicyTarget(db,'a',change)
 let effective=await createPolicyRepository(db).list('a');assert.equal(effective[0].assetClass,'Treasuries');assert.equal(effective[0].effectiveDate,'2025-10-01')
 assert.equal(sql.prepare("SELECT asset_class FROM policy_targets WHERE id='p'").get()?.asset_class,'Bonds')
 const repo=createPolicyRepository(db),replacement={id:'replacement',assetClass:'Bonds',effectiveDate:'2025-09-28',minBasisPoints:1000,maxBasisPoints:2500,targetBasisPoints:null,source:'Replacement',notes:null,createdBy:'a'}
 await assert.rejects(repo.create(replacement,'replacement-key'),/unique/i)
 sql.exec("INSERT INTO policy_targets(id,asset_class,effective_date,min_basis_points,max_basis_points,source,created_by) VALUES('other','Equities','2025-09-28',1000,2500,'Other','a')")
 effective=await repo.list('a');assert.equal(effective.length,2)
 await assert.rejects(correctPolicyTarget(db,'a',{...change,expectedCorrectionId:first.id,expectedAssetClass:'Treasuries',expectedEffectiveDate:'2025-10-01',expectedMinBasisPoints:1200,expectedMaxBasisPoints:2600,expectedSource:'Reviewed source',expectedNotes:'Clarified',assetClass:'Equities',effectiveDate:'2025-09-28',requestKey:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}),/already exists|duplicate/i)
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);sql.close()
})
test('migration preserves existing correction history and foreign keys',()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')&&f<'0097').sort())sql.exec(readFileSync('migrations/'+f,'utf8'))
 sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a'); INSERT INTO policy_targets(id,asset_class,effective_date,min_basis_points,max_basis_points,source,created_by) VALUES('p','Bonds','2025-09-28',1000,2500,'Original','a'); INSERT INTO policy_target_corrections(id,policy_id,old_min,old_max,old_source,new_min,new_max,new_source,reason,created_by,request_key) VALUES('c','p',1000,2500,'Original',1200,2600,'Revised','reason','a','key')`)
 sql.exec('BEGIN');sql.exec(readFileSync('migrations/0097_policy_identity_corrections.sql','utf8'));sql.exec('COMMIT')
 const policy=sql.prepare('SELECT * FROM effective_policy_targets').get();assert.equal(policy?.asset_class,'Bonds');assert.equal(policy?.min_basis_points,1200);assert.equal(policy?.correction_id,'c');assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);sql.close()
})
test('old pending requests preserve an already corrected identity',async()=>{
 const {sql,db}=fixture();const first=await correctPolicyTarget(db,'a',{...request,expectedAssetClass:'Bonds',expectedEffectiveDate:'2025-09-28',assetClass:'Treasuries',effectiveDate:'2025-10-01'})
 const legacy={...request,expectedCorrectionId:first.id,expectedMinBasisPoints:1200,expectedMaxBasisPoints:2600,expectedSource:'Reviewed source',expectedNotes:'Clarified',requestKey:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}
 const second=await correctPolicyTarget(db,'a',legacy);assert.equal((await correctPolicyTarget(db,'a',legacy)).id,second.id);assert.equal((await createPolicyRepository(db).list('a'))[0].assetClass,'Treasuries');sql.close()
})
