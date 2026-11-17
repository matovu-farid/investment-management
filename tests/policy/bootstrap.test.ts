import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'

function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${file}`,'utf8'));return db}
const bootstrap=readFileSync('scripts/bootstrap-current-policy.sql','utf8')
test('bootstrap can be repeated after a policy correction without undoing it',()=>{
 const db=database();db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a')`)
 db.exec(bootstrap);db.exec(bootstrap)
 db.exec(`INSERT INTO policy_target_corrections(id,policy_id,old_class,old_effective_date,new_class,new_effective_date,old_min,old_max,old_target,old_source,old_notes,new_min,new_max,new_target,new_source,new_notes,reason,created_by,request_key) SELECT 'c',id,asset_class,effective_date,'Corrected equities','2025-10-01',min_basis_points,max_basis_points,target_basis_points,source,notes,min_basis_points,max_basis_points,target_basis_points,source,notes,'Correct identity','a','key' FROM effective_policy_targets WHERE id='ips-2025-equities'`)
 db.exec(bootstrap)
 assert.equal(db.prepare('SELECT count(*) AS n FROM effective_policy_targets').get()?.n,5)
 assert.equal(db.prepare("SELECT asset_class FROM effective_policy_targets WHERE id='ips-2025-equities'").get()?.asset_class,'Corrected equities')
 db.close()
})
test('bootstrap leaves an existing effective policy for the same class and date alone',()=>{
 const db=database();db.exec("INSERT INTO policy_targets(id,asset_class,effective_date,min_basis_points,max_basis_points,source,created_by) VALUES('existing','Quoted equities','2025-09-28',1000,2000,'Existing','system')")
 db.exec(bootstrap);db.exec(bootstrap)
 assert.equal(db.prepare('SELECT count(*) AS n FROM effective_policy_targets').get()?.n,5)
 assert.equal(db.prepare("SELECT source FROM effective_policy_targets WHERE id='existing'").get()?.source,'Existing')
 db.close()
})
test('bootstrap respects both a historical reserved identity and a corrected effective identity',()=>{
 const db=database();db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a');
 INSERT INTO policy_targets(id,asset_class,effective_date,min_basis_points,max_basis_points,source,created_by) VALUES('custom','Quoted equities','2025-09-28',1000,2000,'Existing','a');
 INSERT INTO policy_target_corrections(id,policy_id,old_class,old_effective_date,new_class,new_effective_date,old_min,old_max,old_source,new_min,new_max,new_source,reason,created_by,request_key) VALUES('c','custom','Quoted equities','2025-09-28','Short-term instruments','2025-09-28',1000,2000,'Existing',1000,2000,'Existing','Correct class','a','key');`)
 db.exec(bootstrap);db.exec(bootstrap)
 assert.equal(db.prepare('SELECT count(*) AS n FROM effective_policy_targets').get()?.n,4)
 assert.equal(db.prepare("SELECT asset_class FROM effective_policy_targets WHERE id='custom'").get()?.asset_class,'Short-term instruments')
 db.close()
})
