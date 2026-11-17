export async function voidLendingSource(db:D1Database,actorId:string|null,input:unknown){
 if(!actorId||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid request')
 const v=input as Record<string,unknown>
 if((v.sourceKind!=='loan'&&v.sourceKind!=='repayment')||typeof v.sourceId!=='string'||!v.sourceId.trim()||v.sourceId.length>128||typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450||typeof v.requestKey!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey))throw new Error('Invalid request')
 const key=v.requestKey.toLowerCase(),reason=v.reason.trim(),id=crypto.randomUUID()
 await db.prepare('INSERT INTO loan_source_voids(id,source_kind,source_id,reason,request_key,created_by) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM loan_source_voids WHERE request_key=?)').bind(id,v.sourceKind,v.sourceId,reason,key,actorId,key).run()
 const saved=await db.prepare("SELECT id,source_kind AS sourceKind,source_id AS sourceId,reason,created_by AS createdBy,created_at AS createdAt FROM loan_source_voids WHERE request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,actorId).first<{id:string;sourceKind:string;sourceId:string;reason:string;createdBy:string;createdAt:string}>()
 if(!saved||saved.sourceKind!==v.sourceKind||saved.sourceId!==v.sourceId||saved.reason!==reason||saved.createdBy!==actorId)throw new Error('Request unavailable or key already used')
 return saved
}
