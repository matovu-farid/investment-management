const admin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
type Row={id:string;tradeId:string;reason:string;createdBy:string;createdAt:string}
async function requireAdmin(db:D1Database,actor:string|null){if(!actor||!await db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor).first())throw new Error('Unauthorized');return actor}
export async function listTradeVoidOptions(db:D1Database,actorId:string|null){
 const actor=await requireAdmin(db,actorId)
 const [trades,authority]=await db.batch([
  db.prepare(`SELECT t.id,t.sale_id AS saleId,seller.full_name AS sellerName,t.buyer_type AS buyerType,buyer.full_name AS buyerName,t.trade_date AS tradeDate,t.shares,t.price_minor AS priceMinor,t.consideration_minor AS considerationMinor,t.currency,t.reference,t.notes,v.created_at AS voidedAt,v.reason AS voidReason,(SELECT p.id FROM trade_publications p WHERE p.trade_id=t.id AND p.withdrawn_at IS NULL) AS activePublicationId FROM share_trades t JOIN share_sale_requests s ON s.id=t.sale_id JOIN members seller ON seller.id=s.member_id LEFT JOIN members buyer ON buyer.id=t.buyer_member_id LEFT JOIN share_trade_voids v ON v.trade_id=t.id WHERE ${admin} ORDER BY t.trade_date DESC,t.id`).bind(actor),
  db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor),
 ])
 if(!authority.results.length)throw new Error('Unauthorized')
 return {trades:trades.results as {id:string;saleId:string;sellerName:string;buyerType:'member'|'group';buyerName:string|null;tradeDate:string;shares:number;priceMinor:number;considerationMinor:number;currency:string;reference:string|null;notes:string|null;voidedAt:string|null;voidReason:string|null;activePublicationId:string|null}[]}
}
export async function voidTrade(db:D1Database,actorId:string|null,input:unknown){
 const actor=await requireAdmin(db,actorId)
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid request')
 const v=input as Record<string,unknown>
 if(typeof v.tradeId!=='string'||!v.tradeId.trim()||v.tradeId!==v.tradeId.trim()||v.tradeId.length>128||typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>450||typeof v.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey))throw new Error('Invalid request')
 const tradeId=v.tradeId,reason=v.reason.trim(),key=v.requestKey.toLowerCase()
 const find=()=>db.prepare(`SELECT id,trade_id AS tradeId,reason,created_by AS createdBy,created_at AS createdAt FROM share_trade_voids WHERE request_key=? AND ${admin}`).bind(key,actor).first<Row>()
 let row=await find()
 if(!row){try{await db.prepare(`INSERT INTO share_trade_voids(id,trade_id,reason,request_key,created_by) SELECT ?,?,?,?,? WHERE ${admin} AND EXISTS(SELECT 1 FROM share_trades WHERE id=?) AND NOT EXISTS(SELECT 1 FROM share_trade_voids WHERE request_key=?)`).bind(crypto.randomUUID(),tradeId,reason,key,actor,actor,tradeId,key).run()}catch(error){row=await find();if(!row)throw error}row=await find()}
 if(!row||row.tradeId!==tradeId||row.reason!==reason||row.createdBy!==actor)throw new Error('Trade unavailable or request key reused')
 return {id:row.id,tradeId:row.tradeId,reason:row.reason,createdAt:row.createdAt}
}
