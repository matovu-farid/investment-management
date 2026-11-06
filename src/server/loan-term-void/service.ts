export async function voidLoanTerm(db:D1Database,actorId:string|null,input:unknown){
 if(!actorId||(await db.prepare("SELECT role FROM app_user_roles WHERE user_id=?").bind(actorId).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid request')
 const v=input as Record<string,unknown>
 if(typeof v.changeId!=='string'||!v.changeId.trim()||v.changeId!==v.changeId.trim()||v.changeId.length>128||typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450||typeof v.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey))throw new Error('Invalid request')
 const changeId=v.changeId,reason=v.reason.trim(),key=v.requestKey.toLowerCase()
 type Saved={id:string;changeId:string;reason:string;createdBy:string;createdAt:string}
 const find=()=>db.prepare("SELECT id,term_change_id AS changeId,reason,created_by AS createdBy,created_at AS createdAt FROM loan_term_change_voids WHERE request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,actorId).first<Saved>()
 let row=await find();if(!row){try{await db.prepare("INSERT INTO loan_term_change_voids(id,term_change_id,reason,request_key,created_by) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM loan_term_change_voids WHERE request_key=?)").bind(crypto.randomUUID(),changeId,reason,key,actorId,key).run()}catch(e){row=await find();if(!row)throw e}row=await find()}
 if(!row||row.changeId!==changeId||row.reason!==reason||row.createdBy!==actorId)throw new Error('Request key already used or unavailable')
 return row
}
