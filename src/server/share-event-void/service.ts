export async function voidShareEvent(db:D1Database,actorId:string|null,input:unknown){
 if(!actorId||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid request')
 const v=input as Record<string,unknown>
 if(typeof v.eventId!=='string'||!v.eventId.trim()||v.eventId.length>128||typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450||typeof v.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey))throw new Error('Invalid request')
 const key=v.requestKey.toLowerCase(),reason=v.reason.trim()
 await db.prepare('INSERT INTO share_event_voids(id,event_id,reason,request_key,created_by) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM share_event_voids WHERE request_key=?)').bind(crypto.randomUUID(),v.eventId,reason,key,actorId,key).run()
 const saved=await db.prepare("SELECT id,event_id AS eventId,reason,created_by AS createdBy,created_at AS createdAt FROM share_event_voids WHERE request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,actorId).first<{id:string;eventId:string;reason:string;createdBy:string;createdAt:string}>()
 if(!saved||saved.eventId!==v.eventId||saved.reason!==reason||saved.createdBy!==actorId)throw new Error('Request key already used')
 return saved
}
