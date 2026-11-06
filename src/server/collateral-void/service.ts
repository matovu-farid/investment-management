export async function voidCollateral(db:D1Database,actorId:string|null,input:unknown){
 if(!actorId||(await db.prepare("SELECT role FROM app_user_roles WHERE user_id=?").bind(actorId).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid request')
 const v=input as Record<string,unknown>
 if(typeof v.sourceId!=='string'||!v.sourceId.trim()||v.sourceId!==v.sourceId.trim()||v.sourceId.length>128||typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450||typeof v.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey))throw new Error('Invalid request')
 if(v.kind!=='pledge'&&v.kind!=='recovery')throw new Error('Invalid request')
 const kind=v.kind,sourceId=v.sourceId,reason=v.reason.trim(),key=v.requestKey.toLowerCase()
 type Saved={id:string;sourceId:string;kind:string;reason:string;createdBy:string;createdAt:string}
 const find=()=>db.prepare("SELECT id,source_id AS sourceId,source_kind AS kind,reason,created_by AS createdBy,created_at AS createdAt FROM collateral_source_voids WHERE request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,actorId).first<Saved>()
 let row=await find();if(!row){try{await db.prepare("INSERT INTO collateral_source_voids(id,source_kind,source_id,reason,request_key,created_by) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM collateral_source_voids WHERE request_key=?)").bind(crypto.randomUUID(),kind,sourceId,reason,key,actorId,key).run()}catch(e){row=await find();if(!row)throw e}row=await find()}
 if(!row||row.sourceId!==sourceId||row.kind!==kind||row.reason!==reason||row.createdBy!==actorId)throw new Error('Request key already used or unavailable')
 return row
}
