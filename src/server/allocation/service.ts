import type {Dataset} from './calculate'
export async function getAllocationData(db:D1Database,actorId:string|null):Promise<Dataset>{
 if(!actorId)throw new Error('Unauthorized')
 const [roles,investments,valuations,policies]=await db.batch([
  db.prepare("SELECT role,strftime('%Y-%m-%dT%H:%M:%fZ','now') AS snapshotAt FROM app_user_roles WHERE user_id=?").bind(actorId),
  db.prepare("SELECT id,name,asset_class AS assetClass,currency,status FROM investments WHERE EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY name,id").bind(actorId),
  db.prepare("SELECT id,investment_id AS investmentId,valuation_date AS valuationDate,CAST(amount_minor AS TEXT) AS amountMinor,currency,basis,source FROM investment_valuations v WHERE NOT EXISTS (SELECT 1 FROM investment_source_voids x WHERE x.source_kind='valuation' AND x.source_id=v.id) AND EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY valuation_date DESC,id").bind(actorId),
  db.prepare("SELECT id,asset_class AS assetClass,effective_date AS effectiveDate,min_basis_points AS minBasisPoints,max_basis_points AS maxBasisPoints,target_basis_points AS targetBasisPoints,source FROM policy_targets WHERE EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY effective_date DESC,asset_class,id").bind(actorId),
 ])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 const snapshotAt=(roles.results[0] as {snapshotAt:string}).snapshotAt
 return {snapshotAt,investments:investments.results,valuations:valuations.results,policies:policies.results} as Dataset
}
