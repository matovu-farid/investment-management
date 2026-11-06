export type MemberAnnouncement={announcementId:string;shares:number;askingPriceMinor:number;currency:string;publishedAt:string;deadlineDate:string|null;extensions:{eventDate:string;deadlineDate:string}[]}
type AdminAnnouncement={id:string;saleId:string;publishedAt:string;withdrawnAt:string|null}
type Stored={id:string;saleId:string;publishedBy:string;publishedAt:string;publishKey:string;withdrawnBy:string|null;withdrawnAt:string|null;withdrawKey:string|null}
async function admin(db:D1Database,id:string|null){if(!id||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(id).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized');return id}
async function member(db:D1Database,id:string|null){if(!id||!await db.prepare("SELECT 1 AS ok FROM member_user_links l JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL").bind(id).first())throw new Error('Unauthorized')}
function args(input:unknown,idField:'saleId'|'announcementId') {if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid input');const v=input as Record<string,unknown>,id=v[idField],k=v.requestKey;if(typeof id!=='string'||!id.trim()||id.length>128||typeof k!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k))throw new Error('Invalid input');return {id:id.trim(),key:k.toLowerCase()}}
const cols='id,sale_id AS saleId,published_by AS publishedBy,published_at AS publishedAt,publish_key AS publishKey,withdrawn_by AS withdrawnBy,withdrawn_at AS withdrawnAt,withdraw_key AS withdrawKey'
export async function publishAnnouncement(db:D1Database,actorId:string|null,input:unknown){
 const actor=await admin(db,actorId),{id:saleId,key}=args(input,'saleId'),v=input as Record<string,unknown>
 const shares=v.expectedShares,price=v.expectedPriceMinor,currency=v.expectedCurrency,deadline=v.expectedDeadlineDate,requestDate=v.expectedRequestDate
 if(typeof shares!=='number'||!Number.isSafeInteger(shares)||shares<1||typeof price!=='number'||!Number.isSafeInteger(price)||price<1||typeof currency!=='string'||! /^[A-Z]{3}$/.test(currency)||(typeof requestDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(requestDate))||(deadline!==null&&(typeof deadline!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(deadline))))throw new Error('Invalid review')
 type Saved=Stored & {shares:number;price:number;currency:string;deadline:string|null;requestDate:string}
 const find=()=>db.prepare(`SELECT ${cols},(SELECT shares FROM share_sale_requests WHERE id=sale_id) AS shares,(SELECT asking_price_minor FROM share_sale_requests WHERE id=sale_id) AS price,(SELECT currency FROM share_sale_requests WHERE id=sale_id) AS currency,(SELECT deadline_date FROM share_sale_requests WHERE id=sale_id) AS deadline,(SELECT request_date FROM share_sale_requests WHERE id=sale_id) AS requestDate FROM share_sale_announcements WHERE publish_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(key,actor).first<Saved>()
 let row=await find();if(!row){try{await db.prepare(`INSERT INTO share_sale_announcements(id,sale_id,published_by,publish_key) SELECT ?,s.id,?,? FROM share_sale_requests s WHERE s.id=? AND s.shares=? AND s.asking_price_minor=? AND s.currency=? AND s.deadline_date IS ? AND s.request_date=? AND s.request_date<=date('now','+3 hours') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND NOT EXISTS(SELECT 1 FROM share_sale_announcements WHERE publish_key=?)`).bind(crypto.randomUUID(),actor,key,saleId,shares,price,currency,deadline,requestDate,actor,key).run()}catch(error){row=await find();if(!row)throw error}row=await find()}
 if(!row)throw new Error('Request changed or access unavailable; review again')
 if(row.saleId!==saleId||row.publishedBy!==actor||row.shares!==shares||row.price!==price||row.currency!==currency||row.deadline!==deadline||row.requestDate!==requestDate)throw new Error('Request key already used for different details');return {id:row.id,active:row.withdrawnAt===null}
}
export async function withdrawAnnouncement(db:D1Database,actorId:string|null,input:unknown){const actor=await admin(db,actorId),{id,key}=args(input,'announcementId');
 await db.prepare("UPDATE share_sale_announcements SET withdrawn_at=CURRENT_TIMESTAMP,withdrawn_by=?,withdraw_key=? WHERE id=? AND withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor,key,id,actor).run();
 const row=await db.prepare(`SELECT ${cols} FROM share_sale_announcements WHERE id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(id,actor).first<Stored>();
 if(!row||!row.withdrawnAt||row.withdrawKey!==key||row.withdrawnBy!==actor)throw new Error('Announcement already withdrawn or not found');return {id:row.id}
}
export async function publishExtension(db:D1Database,actorId:string|null,input:unknown){
 const actor=await admin(db,actorId),{id:announcementId,key}=args(input,'announcementId')
 const eventId=(input as Record<string,unknown>).eventId
 if(typeof eventId!=='string'||!eventId.trim()||eventId.length>128)throw new Error('Invalid input')
 const event=eventId.trim()
 type Row={id:string;announcementId:string;eventId:string;publishedBy:string}
 const find=()=>db.prepare('SELECT id,announcement_id AS announcementId,event_id AS eventId,published_by AS publishedBy FROM share_sale_announcement_extensions WHERE request_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role=\'admin\')').bind(key,actor).first<Row>()
 let row=await find()
 if(!row){try{await db.prepare('INSERT INTO share_sale_announcement_extensions(id,announcement_id,event_id,published_by,request_key) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role=\'admin\') AND NOT EXISTS(SELECT 1 FROM share_sale_announcement_extensions WHERE request_key=?)').bind(crypto.randomUUID(),announcementId,event,actor,key,actor,key).run()}catch(error){row=await find();if(!row)throw error}row=await find()}
 if(!row||row.announcementId!==announcementId||row.eventId!==event||row.publishedBy!==actor)throw new Error('Request key already used for different details')
 return {id:row.id}
}
export async function listMemberAnnouncements(db:D1Database,actorId:string|null):Promise<MemberAnnouncement[]>{
 await member(db,actorId)
 const rows=(await db.prepare(`SELECT a.id AS announcementId,s.shares,s.asking_price_minor AS askingPriceMinor,s.currency,a.published_at AS publishedAt,s.deadline_date AS deadlineDate FROM share_sale_announcements a JOIN share_sale_requests s ON s.id=a.sale_id JOIN member_user_links l ON l.user_id=? AND l.revoked_at IS NULL JOIN members m ON m.id=l.member_id AND m.status='active' WHERE a.withdrawn_at IS NULL ORDER BY a.published_at DESC,a.id`).bind(actorId).all<Omit<MemberAnnouncement,'extensions'>>()).results
 const extensions=(await db.prepare(`SELECT p.announcement_id AS announcementId,e.status_date AS eventDate,e.new_deadline_date AS deadlineDate FROM share_sale_announcement_extensions p JOIN share_sale_announcements a ON a.id=p.announcement_id JOIN share_sale_status_events e ON e.id=p.event_id JOIN member_user_links l ON l.user_id=? AND l.revoked_at IS NULL JOIN members m ON m.id=l.member_id AND m.status='active' WHERE a.withdrawn_at IS NULL ORDER BY p.rowid`).bind(actorId).all<{announcementId:string;eventDate:string;deadlineDate:string}>()).results
 return rows.map(row=>({...row,extensions:extensions.filter(e=>e.announcementId===row.announcementId).map(({eventDate,deadlineDate})=>({eventDate,deadlineDate}))}))
}
export async function listPublishableExtensions(db:D1Database,actorId:string|null){
 const actor=await admin(db,actorId)
 return (await db.prepare(`SELECT a.id AS announcementId,a.sale_id AS saleId,e.id AS eventId,e.status_date AS eventDate,e.new_deadline_date AS deadlineDate FROM share_sale_announcements a JOIN share_sale_status_events e ON e.sale_id=a.sale_id WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND a.withdrawn_at IS NULL AND e.status='extended' AND e.new_deadline_date IS NOT NULL AND e.status_date<=date('now','+3 hours') AND NOT EXISTS (SELECT 1 FROM share_sale_announcement_extensions p WHERE p.announcement_id=a.id AND p.event_id=e.id) ORDER BY e.status_date,e.id`).bind(actor).all<{announcementId:string;saleId:string;eventId:string;eventDate:string;deadlineDate:string}>()).results
}
export async function listPublishedExtensions(db:D1Database,actorId:string|null){
 const actor=await admin(db,actorId)
 return (await db.prepare(`SELECT p.id,a.sale_id AS saleId,p.announcement_id AS announcementId,e.status_date AS eventDate,e.new_deadline_date AS deadlineDate,p.published_at AS publishedAt,a.withdrawn_at AS withdrawnAt FROM share_sale_announcement_extensions p JOIN share_sale_announcements a ON a.id=p.announcement_id JOIN share_sale_status_events e ON e.id=p.event_id WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY p.rowid DESC`).bind(actor).all<{id:string;saleId:string;announcementId:string;eventDate:string;deadlineDate:string;publishedAt:string;withdrawnAt:string|null}>()).results
}
export async function listAdminAnnouncements(db:D1Database,actorId:string|null){const actor=await admin(db,actorId);return (await db.prepare("SELECT id,sale_id AS saleId,published_at AS publishedAt,withdrawn_at AS withdrawnAt FROM share_sale_announcements WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY published_at DESC,id").bind(actor).all<AdminAnnouncement>()).results}
export async function listAdminSales(db:D1Database,actorId:string|null){const actor=await admin(db,actorId);return (await db.prepare(`SELECT s.id,m.full_name AS memberName,s.shares,s.asking_price_minor AS askingPriceMinor,s.deadline_date AS deadlineDate,s.currency,s.request_date AS requestDate FROM share_sale_requests s JOIN members m ON m.id=s.member_id WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND s.request_date<=date('now','+3 hours') AND NOT EXISTS(SELECT 1 FROM share_sale_announcements a WHERE a.sale_id=s.id AND a.withdrawn_at IS NULL) AND NOT EXISTS(SELECT 1 FROM share_sale_status_events e WHERE e.sale_id=s.id AND e.status IN ('closed','cancelled')) ORDER BY s.request_date DESC,s.id`).bind(actor).all<{id:string;memberName:string;shares:number;askingPriceMinor:number;deadlineDate:string|null;currency:string;requestDate:string}>()).results}

type MemberInterest={id:string;announcementId:string;interestDate:string;shares:number}
const interestColumns='r.id,r.announcement_id AS announcementId,r.interest_date AS interestDate,r.shares'
const ownedInterest=`FROM member_sale_interest_requests r JOIN member_user_links l ON l.user_id=r.actor_id AND l.member_id=r.member_id AND l.revoked_at IS NULL JOIN members m ON m.id=l.member_id AND m.status='active'`
export async function listMemberInterests(db:D1Database,actorId:string|null):Promise<MemberInterest[]>{
 await member(db,actorId)
 return (await db.prepare(`SELECT ${interestColumns} FROM member_sale_interest_requests r JOIN member_user_links l ON l.member_id=r.member_id AND l.revoked_at IS NULL JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? ORDER BY r.created_at DESC,r.id`).bind(actorId).all<MemberInterest>()).results
}
export async function submitMemberInterest(db:D1Database,actorId:string|null,data:unknown):Promise<MemberInterest>{
 const fail=()=>new Error('Interest could not be recorded.')
 if(!actorId||!data||typeof data!=='object'||Array.isArray(data))throw fail()
 const v=data as Record<string,unknown>
 if(typeof v.announcementId!=='string'||!v.announcementId.trim()||v.announcementId.length>128||typeof v.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey)||typeof v.shares!=='string'||!/^\d+$/.test(v.shares)||!Number.isSafeInteger(Number(v.shares))||Number(v.shares)<1)throw fail()
 const announcementId=v.announcementId.trim(),requestKey=v.requestKey.toLowerCase(),shares=Number(v.shares)
 const find=()=>db.prepare(`SELECT ${interestColumns} ${ownedInterest} WHERE r.actor_id=? AND r.request_key=?`).bind(actorId,requestKey).first<MemberInterest>()
 let row=await find()
 if(!row){
  try{
   await db.prepare(`INSERT INTO member_sale_interest_requests(id,announcement_id,member_id,actor_id,shares,request_key)
    SELECT ?,?,l.member_id,?,?,? FROM member_user_links l JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.user_id=? AND l.revoked_at IS NULL
    ON CONFLICT(request_key) DO NOTHING`).bind(crypto.randomUUID(),announcementId,actorId,shares,requestKey,actorId).run()
  }catch{ /* Inspect the saved result: a racing identical request may have committed. */ }
  row=await find()
 }
 if(!row||row.announcementId!==announcementId||row.shares!==shares)throw fail()
 return row
}
