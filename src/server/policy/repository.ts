import type { PolicyRepository, PolicyTarget } from './service'
const columns='id,asset_class AS assetClass,effective_date AS effectiveDate,min_basis_points AS minBasisPoints,max_basis_points AS maxBasisPoints,target_basis_points AS targetBasisPoints,source,notes,created_by AS createdBy'
export function createPolicyRepository(db:D1Database):PolicyRepository {
 return {
  async roleFor(id){return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(id).first<{role:string}>())?.role ?? null},
  async list(){return (await db.prepare(`SELECT ${columns} FROM policy_targets ORDER BY effective_date DESC,asset_class,id`).all<PolicyTarget>()).results},
  async create(value,key){
   await db.prepare('INSERT INTO policy_targets(id,asset_class,effective_date,min_basis_points,max_basis_points,target_basis_points,source,notes,created_by,request_key) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING').bind(value.id,value.assetClass,value.effectiveDate,value.minBasisPoints,value.maxBasisPoints,value.targetBasisPoints,value.source,value.notes,value.createdBy,key).run()
   const saved=await db.prepare(`SELECT ${columns} FROM policy_targets WHERE request_key=?`).bind(key).first<PolicyTarget>()
   if(!saved || (['assetClass','effectiveDate','minBasisPoints','maxBasisPoints','targetBasisPoints','source','notes','createdBy'] as const).some(field=>saved[field]!==value[field])) throw new Error('Request key already used for different details')
   return saved
  },
 }
}
