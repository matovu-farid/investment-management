import type {Trade,TradeRepository} from './service'
const cols='id,sale_id AS saleId,buyer_type AS buyerType,buyer_member_id AS buyerMemberId,shares,trade_date AS tradeDate,price_minor AS priceMinor,consideration_minor AS considerationMinor,currency,reference,notes,created_by AS createdBy'
const admin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
export function createTradeRepository(db:D1Database):TradeRepository{return {
 async roleFor(id){return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(id).first<{role:string}>())?.role??null},
 async list(actor){
  // Every sensitive read and the authority check share one D1 snapshot.
  const [members,sales,trades,authority]=await db.batch([
   db.prepare(`SELECT id,full_name AS fullName,member_number AS memberNumber,status FROM members WHERE ${admin} ORDER BY full_name,id`).bind(actor),
   db.prepare(`SELECT s.id,s.member_id AS sellerId,m.full_name AS memberName,s.request_date AS requestDate,s.currency,s.shares FROM share_sale_requests s JOIN members m ON m.id=s.member_id WHERE ${admin} ORDER BY s.request_date DESC,s.id`).bind(actor),
   db.prepare(`SELECT t.id,t.sale_id AS saleId,t.buyer_type AS buyerType,t.buyer_member_id AS buyerMemberId,t.shares,t.trade_date AS tradeDate,t.price_minor AS priceMinor,t.consideration_minor AS considerationMinor,t.currency,t.reference,t.notes,t.created_by AS createdBy,seller.full_name AS sellerName,buyer.full_name AS buyerName,v.created_at AS voidedAt,v.reason AS voidReason FROM share_trades t JOIN share_sale_requests s ON s.id=t.sale_id JOIN members seller ON seller.id=s.member_id LEFT JOIN members buyer ON buyer.id=t.buyer_member_id LEFT JOIN share_trade_voids v ON v.trade_id=t.id WHERE ${admin} ORDER BY t.trade_date DESC,t.id`).bind(actor),
   db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor),
  ])
  if(!authority.results.length)throw new Error('Unauthorized')
  return {members:members.results as {id:string;fullName:string;memberNumber:string;status:string}[],sales:sales.results as {id:string;sellerId:string;memberName:string;requestDate:string;currency:string;shares:number}[],trades:trades.results as (Trade & {sellerName:string;buyerName:string|null})[]}
 },
 async create(v,key){
  const find=()=>db.prepare(`SELECT ${cols},(SELECT created_at FROM share_trade_voids WHERE trade_id=share_trades.id) AS voidedAt FROM share_trades WHERE request_key=? AND ${admin}`).bind(key,v.createdBy).first<Trade>()
  let row=await find()
  if(!row){try{await db.prepare(`INSERT INTO share_trades(id,sale_id,buyer_type,buyer_member_id,shares,trade_date,price_minor,consideration_minor,currency,reference,notes,created_by,request_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${admin} AND NOT EXISTS(SELECT 1 FROM share_trades WHERE request_key=?)`).bind(v.id,v.saleId,v.buyerType,v.buyerMemberId,v.shares,v.tradeDate,v.priceMinor,v.considerationMinor,v.currency,v.reference,v.notes,v.createdBy,key,v.createdBy,key).run()}catch(e){row=await find();if(!row)throw e}row=await find()}
  const fields:(keyof Trade)[]=['saleId','buyerType','buyerMemberId','shares','tradeDate','priceMinor','considerationMinor','currency','reference','notes','createdBy']
  if(!row)throw new Error('Unauthorized or trade unavailable')
  if(fields.some(f=>row![f]!==v[f]))throw new Error('Request key already used for different trade')
  if(row.voidedAt)throw new Error('Trade was voided')
  return row
 },
}}
