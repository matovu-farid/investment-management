type Member = { id:string; memberNumber:string; fullName:string }
type Share = { id:string; eventType:string; shares:number; eventDate:string }
type JointHolding = { id:string }
type JointEvent = Share & { holdingId:string }
type Booking = { id:string; requestedMinor:number; currency:string; requestedDate:string; status:string }
type BookingFulfilment = { id:string; bookingId:string; amountMinor:number; fulfilmentDate:string }
type BookingEvent = { id:string; bookingId:string; eventType:string; eventDate:string }
type Loan = { id:string; principalMinor:number; currency:string; disbursementDate:string; maturityDate:string|null; terms:string }
type TermChange = { id:string; loanId:string; effectiveDate:string; terms:string; createdAt:string }
type Trade = { id:string; direction:'sale'|'purchase'; tradeDate:string; shares:number; priceMinor:number; considerationMinor:number; currency:string }
type Repayment = { id:string; loanId:string; paymentDate:string; amountMinor:number; currency:string; reference:string|null }
async function requireAdmin(db:D1Database, actorId:string|null) {
 if(!actorId || (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId).first<{role:string}>())?.role!=='admin') throw new Error('Unauthorized')
}
export async function listLinkOptions(db:D1Database,actorId:string|null) {
 await requireAdmin(db,actorId)
 const users=(await db.prepare(`SELECT u.id,u.name,u.email FROM "user" u LEFT JOIN member_user_links l ON l.user_id=u.id AND l.revoked_at IS NULL WHERE l.user_id IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY u.name,u.id`).bind(actorId).all<{id:string;name:string;email:string}>()).results
 const members=(await db.prepare("SELECT m.id,m.member_number AS memberNumber,m.full_name AS fullName FROM members m LEFT JOIN member_user_links l ON l.member_id=m.id AND l.revoked_at IS NULL WHERE m.status='active' AND l.member_id IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY m.full_name,m.id").bind(actorId).all<Member>()).results
 const links=(await db.prepare(`SELECT l.id,u.name AS userName,u.email,m.full_name AS memberName,m.member_number AS memberNumber FROM member_user_links l JOIN "user" u ON u.id=l.user_id JOIN members m ON m.id=l.member_id WHERE l.revoked_at IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY m.full_name`).bind(actorId).all<{id:string;userName:string;email:string;memberName:string;memberNumber:string}>()).results
 await requireAdmin(db,actorId)
 return {users,members,links}
}
export async function linkMember(db:D1Database,actorId:string|null,input:unknown) {
 await requireAdmin(db,actorId)
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid link')
 const v=input as Record<string,unknown>
 function field(value:unknown,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid reviewed identity');return value}
 const userId=field(v.userId,128),memberId=field(v.memberId,128),userName=field(v.expectedUserName,200),userEmail=field(v.expectedUserEmail,320),memberName=field(v.expectedMemberName,200),memberNumber=field(v.expectedMemberNumber,64),requestKey=key(v.requestKey)
 type Saved={id:string;userId:string;memberId:string;linkedBy:string;revokedAt:string|null;currentLinkId:string|null;userName:string|null;userEmail:string|null;memberName:string|null;memberNumber:string|null}
 const find=()=>db.prepare(`SELECT l.id,l.user_id AS userId,l.member_id AS memberId,l.linked_by AS linkedBy,l.revoked_at AS revokedAt,l.reviewed_user_name AS userName,l.reviewed_user_email AS userEmail,l.reviewed_member_name AS memberName,l.reviewed_member_number AS memberNumber,(SELECT c.id FROM member_user_links c WHERE c.user_id=l.user_id AND c.revoked_at IS NULL) AS currentLinkId FROM member_user_links l WHERE l.link_request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(requestKey,actorId).first<Saved>()
 let row=await find()
 if(!row){try{await db.prepare(`INSERT INTO member_user_links(id,user_id,member_id,linked_by,link_request_key,reviewed_user_name,reviewed_user_email,reviewed_member_name,reviewed_member_number) SELECT ?,u.id,m.id,?,?,?,?,?,? FROM "user" u JOIN members m ON m.id=? AND m.status='active' WHERE u.id=? AND u.name=? AND u.email=? AND m.full_name=? AND m.member_number=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND NOT EXISTS(SELECT 1 FROM member_user_links WHERE link_request_key=?)`).bind(crypto.randomUUID(),actorId,requestKey,userName,userEmail,memberName,memberNumber,memberId,userId,userName,userEmail,memberName,memberNumber,actorId,requestKey).run()}catch(error){row=await find();if(!row)throw error}row=await find()}
 if(!row) throw new Error('User, member or administrator changed; review again')
 if(row.userId!==userId||row.memberId!==memberId||row.linkedBy!==actorId||row.userName!==userName||row.userEmail!==userEmail||row.memberName!==memberName||row.memberNumber!==memberNumber)throw new Error('Request key already used for different link')
 return {id:row.id,active:row.revokedAt===null,currentLinkId:row.currentLinkId}
}
function key(value:unknown){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new Error('Invalid request key');return value.toLowerCase()}
class UnlinkedMemberError extends Error { constructor(){super('Unauthorized')} }
export async function getMyPortfolio(db:D1Database,actorId:string|null) {
 if(!actorId) throw new Error('Unauthorized')
 // D1 batches run as one transaction: identity and all facts must describe the same link.
 const [memberRows,shareRows,loanRows,repaymentRows,tradeRows,jointRows,jointEventRows,bookingRows,fulfilmentRows,bookingEventRows,termRows]=await db.batch([
  db.prepare("SELECT m.id,m.member_number AS memberNumber,m.full_name AS fullName FROM member_user_links l JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL").bind(actorId),
  db.prepare("SELECT s.id,s.event_type AS eventType,s.shares,s.event_date AS eventDate FROM share_events s JOIN member_user_links l ON l.member_id=s.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM share_event_voids v WHERE v.event_id=s.id) ORDER BY s.event_date,s.id").bind(actorId),
  db.prepare("SELECT n.id,n.principal_minor AS principalMinor,n.currency,n.disbursement_date AS disbursementDate,n.maturity_date AS maturityDate,n.terms FROM loans n JOIN member_user_links l ON l.member_id=n.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=n.id) ORDER BY n.disbursement_date,n.id").bind(actorId),
  db.prepare("SELECT r.id,r.loan_id AS loanId,r.payment_date AS paymentDate,r.amount_minor AS amountMinor,n.currency,r.reference FROM loan_repayments r JOIN loans n ON n.id=r.loan_id JOIN member_user_links l ON l.member_id=n.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE (v.source_kind='loan' AND v.source_id=n.id) OR (v.source_kind='repayment' AND v.source_id=r.id)) ORDER BY r.payment_date,r.id").bind(actorId),
  db.prepare("SELECT t.id,CASE WHEN s.member_id=l.member_id THEN 'sale' ELSE 'purchase' END AS direction,t.trade_date AS tradeDate,t.shares,t.price_minor AS priceMinor,t.consideration_minor AS considerationMinor,t.currency FROM share_trades t JOIN share_sale_requests s ON s.id=t.sale_id JOIN member_user_links l ON (l.member_id=s.member_id OR l.member_id=t.buyer_member_id) JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM share_trade_voids v WHERE v.trade_id=t.id) ORDER BY t.trade_date,t.id").bind(actorId),
  db.prepare("SELECT j.id FROM joint_shareholdings j JOIN joint_shareholding_members jm ON jm.shareholding_id=j.id JOIN member_user_links l ON l.member_id=jm.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL ORDER BY j.id").bind(actorId),
  db.prepare("SELECT e.id,e.joint_shareholding_id AS holdingId,e.event_type AS eventType,e.shares,e.event_date AS eventDate FROM share_events e JOIN joint_shareholding_members jm ON jm.shareholding_id=e.joint_shareholding_id JOIN member_user_links l ON l.member_id=jm.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM share_event_voids v WHERE v.event_id=e.id) ORDER BY e.event_date,e.id").bind(actorId),
  db.prepare("SELECT b.id,b.requested_minor AS requestedMinor,b.currency,b.requested_date AS requestedDate,b.status FROM credit_bookings b JOIN member_user_links l ON l.member_id=b.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL ORDER BY b.requested_date,b.id").bind(actorId),
  db.prepare("SELECT f.id,f.booking_id AS bookingId,f.amount_minor AS amountMinor,f.fulfilment_date AS fulfilmentDate FROM credit_booking_fulfilments f JOIN credit_bookings b ON b.id=f.booking_id JOIN member_user_links l ON l.member_id=b.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id) ORDER BY f.fulfilment_date,f.id").bind(actorId),
  db.prepare("SELECT e.id,e.booking_id AS bookingId,e.event_type AS eventType,e.event_date AS eventDate FROM booking_status_events e JOIN credit_bookings b ON b.id=e.booking_id JOIN member_user_links l ON l.member_id=b.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL ORDER BY e.event_date,e.id").bind(actorId),
  db.prepare("SELECT t.id,t.loan_id AS loanId,t.effective_date AS effectiveDate,t.terms,t.created_at AS createdAt FROM loan_term_changes t JOIN loans n ON n.id=t.loan_id JOIN member_user_links l ON l.member_id=n.member_id JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=n.id) AND NOT EXISTS(SELECT 1 FROM loan_term_change_voids tv WHERE tv.term_change_id=t.id) ORDER BY t.effective_date,t.id").bind(actorId),
 ])
 const member=memberRows.results[0] as Member | undefined
 if(!member) throw new UnlinkedMemberError()
 const shares=shareRows.results as Share[],loans=loanRows.results as Loan[],repayments=repaymentRows.results as Repayment[],trades=tradeRows.results as Trade[]
 const jointHoldings=jointRows.results as JointHolding[],jointEvents=jointEventRows.results as JointEvent[],bookings=bookingRows.results as Booking[],bookingFulfilments=fulfilmentRows.results as BookingFulfilment[],bookingEvents=bookingEventRows.results as BookingEvent[]
 const termChanges=termRows.results as TermChange[]
 return {member,shares,loans,repayments,trades,jointHoldings,jointEvents,bookings,bookingFulfilments,bookingEvents,termChanges}
}

/** Distinguish a verified missing link from an operational failure. */
export async function readMyPortfolio(db:D1Database,actorId:string|null) {
 try { return {status:'linked' as const,portfolio:await getMyPortfolio(db,actorId)} }
 catch(error) { if(error instanceof UnlinkedMemberError) return {status:'unlinked' as const}; throw error }
}

export async function revokeMemberLink(db:D1Database,actorId:string|null,input:unknown) {
 await requireAdmin(db,actorId)
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid link')
 const {linkId,requestKey:rawKey}=input as Record<string,unknown>
 if(typeof linkId!=='string'||!linkId.trim()||linkId.length>128)throw new Error('Invalid link')
 const requestKey=key(rawKey)
 const find=()=>db.prepare('SELECT l.id,l.revoked_by AS revokedBy,(SELECT c.id FROM member_user_links c WHERE c.user_id=l.user_id AND c.revoked_at IS NULL) AS currentLinkId FROM member_user_links l WHERE l.revoke_request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role=\'admin\')').bind(requestKey,actorId).first<{id:string;revokedBy:string;currentLinkId:string|null}>()
 let row=await find()
 if(!row){try{await db.prepare('UPDATE member_user_links SET revoked_by=?,revoked_at=CURRENT_TIMESTAMP,revoke_request_key=? WHERE id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role=\'admin\')').bind(actorId,requestKey,linkId,actorId).run()}catch(error){row=await find();if(!row)throw error}row=await find()}
 if(!row)throw new Error('Active link not found')
 if(row.id!==linkId||row.revokedBy!==actorId)throw new Error('Request key already used for different revocation')
 return {id:row.id,currentLinkId:row.currentLinkId}
}
