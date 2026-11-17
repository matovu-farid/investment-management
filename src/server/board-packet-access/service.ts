import {boardPacketSummary} from '../../lib/board-packet-summary.ts'
import type {Packet} from '../board-packets/service.ts'
type Grant={id:string;packetId:string;userId:string;linkId:string;memberId:string;memberName:string;memberNumber:string;email:string;grantedAt:string;revokedAt:string|null;shareMode:'full'|'summary'}
type Recipient={userId:string;linkId:string;memberId:string;memberName:string;memberNumber:string;email:string}
type PacketMeta={id:string;createdAt:string;start:string;end:string}
const adminPredicate="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
async function admin(db:D1Database,actor:string|null){if(!actor||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized');return actor}
function object(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid request');return v as Record<string,unknown>}
function id(v:unknown){if(typeof v!=='string'||!v.trim()||v.length>128||v!==v.trim())throw new Error('Invalid selection');return v}
function reviewed(v:unknown,max:number){if(typeof v!=='string'||!v.trim()||v.length>max||v!==v.trim())throw new Error('Invalid reviewed identity');return v}
function key(v:unknown){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new Error('Invalid request key');return v.toLowerCase()}
export async function listBoardPacketAccess(db:D1Database,actorId:string|null){
 const actor=await admin(db,actorId)
 const [packets,recipients,grants,authority]=await db.batch([
  db.prepare(`SELECT p.id,p.created_at AS createdAt,json_extract(v.packet,'$.start') AS start,json_extract(v.packet,'$.end') AS end FROM board_packets p JOIN board_packet_previews v ON v.id=p.preview_id WHERE ${adminPredicate} ORDER BY p.created_at DESC,p.id`).bind(actor),
  db.prepare(`SELECT u.id AS userId,l.id AS linkId,m.id AS memberId,m.full_name AS memberName,m.member_number AS memberNumber,u.email FROM member_user_links l JOIN members m ON m.id=l.member_id AND m.status='active' JOIN "user" u ON u.id=l.user_id WHERE l.revoked_at IS NULL AND ${adminPredicate} ORDER BY m.full_name,m.id`).bind(actor),
  db.prepare(`SELECT g.id,g.packet_id AS packetId,g.user_id AS userId,g.link_id AS linkId,g.member_id AS memberId,g.reviewed_member_name AS memberName,g.reviewed_member_number AS memberNumber,g.reviewed_email AS email,g.granted_at AS grantedAt,r.revoked_at AS revokedAt,g.share_mode AS shareMode FROM board_packet_access_grants g JOIN members m ON m.id=g.member_id JOIN "user" u ON u.id=g.user_id LEFT JOIN board_packet_access_revocations r ON r.grant_id=g.id WHERE ${adminPredicate} ORDER BY g.granted_at DESC,g.id`).bind(actor),
  db.prepare(`SELECT 1 AS ok WHERE ${adminPredicate}`).bind(actor)
 ])
 if(!authority.results.length)throw new Error('Unauthorized')
 return {packets:packets.results as PacketMeta[],recipients:recipients.results as Recipient[],grants:grants.results as Grant[]}
}
export async function grantBoardPacketAccess(db:D1Database,actorId:string|null,input:unknown){
 const actor=await admin(db,actorId),v=object(input),packetId=id(v.packetId),userId=id(v.userId),linkId=id(v.linkId),requestKey=key(v.requestKey),expectedMemberName=reviewed(v.expectedMemberName,200),expectedMemberNumber=reviewed(v.expectedMemberNumber,64),expectedEmail=reviewed(v.expectedEmail,254)
 const shareMode=v.shareMode===undefined?'full':v.shareMode;if(shareMode!=='full'&&shareMode!=='summary')throw new Error('Invalid sharing mode')
 const expectedSummary=shareMode==='summary'?JSON.stringify(boardPacketSummary(v.expectedSummary)):null
 type Saved={id:string;packetId:string;userId:string;linkId:string;memberName:string;memberNumber:string;email:string;grantedBy:string;revokedAt:string|null;linkActive:number;shareMode:string;summaryJson:string|null}
 const find=()=>db.prepare(`SELECT g.id,g.packet_id AS packetId,g.user_id AS userId,g.link_id AS linkId,g.reviewed_member_name AS memberName,g.reviewed_member_number AS memberNumber,g.reviewed_email AS email,g.granted_by AS grantedBy,r.revoked_at AS revokedAt,g.share_mode AS shareMode,g.summary_json AS summaryJson,EXISTS(SELECT 1 FROM member_user_links l JOIN members m ON m.id=l.member_id AND m.status='active' WHERE l.id=g.link_id AND l.user_id=g.user_id AND l.member_id=g.member_id AND l.revoked_at IS NULL) AS linkActive FROM board_packet_access_grants g LEFT JOIN board_packet_access_revocations r ON r.grant_id=g.id WHERE g.request_key=? AND ${adminPredicate}`).bind(requestKey,actor).first<Saved>()
 let saved=await find()
 if(!saved){
  const packet=await db.prepare(`SELECT v.packet FROM board_packets p JOIN board_packet_previews v ON v.id=p.preview_id WHERE p.id=? AND ${adminPredicate}`).bind(packetId,actor).first<{packet:string}>()
  if(!packet)throw new Error('Draft unavailable')
  const summary=shareMode==='summary'?JSON.stringify(boardPacketSummary(JSON.parse(packet.packet))):null
  if(summary!==expectedSummary)throw new Error('Summary changed; review again')
  try{await db.prepare(`INSERT INTO board_packet_access_grants(id,packet_id,user_id,link_id,member_id,reviewed_member_name,reviewed_member_number,reviewed_email,request_key,granted_by,share_mode,summary_json) SELECT ?,?,?,l.id,l.member_id,m.full_name,m.member_number,u.email,?,?,?,? FROM member_user_links l JOIN members m ON m.id=l.member_id AND m.status='active' JOIN "user" u ON u.id=l.user_id WHERE l.id=? AND l.user_id=? AND l.revoked_at IS NULL AND m.full_name=? AND m.member_number=? AND u.email=? AND ${adminPredicate} AND EXISTS(SELECT 1 FROM board_packets p JOIN board_packet_previews v ON v.id=p.preview_id WHERE p.id=? AND v.packet=?) AND NOT EXISTS(SELECT 1 FROM board_packet_access_grants WHERE request_key=?)`).bind(crypto.randomUUID(),packetId,userId,requestKey,actor,shareMode,summary,linkId,userId,expectedMemberName,expectedMemberNumber,expectedEmail,actor,packetId,packet.packet,requestKey).run()}catch(e){saved=await find();if(!saved)throw e}saved=await find()
 }
 if(!saved||saved.packetId!==packetId||saved.userId!==userId||saved.linkId!==linkId||saved.memberName!==expectedMemberName||saved.memberNumber!==expectedMemberNumber||saved.email!==expectedEmail||saved.grantedBy!==actor||saved.shareMode!==shareMode||saved.summaryJson!==expectedSummary)throw new Error('Grant unavailable or request key reused')
 return {id:saved.id,active:saved.revokedAt===null&&saved.linkActive===1}
}
export async function revokeBoardPacketAccess(db:D1Database,actorId:string|null,input:unknown){
 const actor=await admin(db,actorId),v=object(input),grantId=id(v.grantId),requestKey=key(v.requestKey)
 type Saved={id:string;grantId:string;revokedBy:string}
 const find=()=>db.prepare(`SELECT r.id,r.grant_id AS grantId,r.revoked_by AS revokedBy FROM board_packet_access_revocations r WHERE r.request_key=? AND ${adminPredicate}`).bind(requestKey,actor).first<Saved>()
 let saved=await find();if(!saved){try{await db.prepare(`INSERT INTO board_packet_access_revocations(id,grant_id,request_key,revoked_by) SELECT ?,?,?,? WHERE ${adminPredicate} AND EXISTS(SELECT 1 FROM board_packet_access_grants WHERE id=?) AND NOT EXISTS(SELECT 1 FROM board_packet_access_revocations WHERE request_key=?)`).bind(crypto.randomUUID(),grantId,requestKey,actor,actor,grantId,requestKey).run()}catch(e){saved=await find();if(!saved)throw e}saved=await find()}
 if(!saved||saved.grantId!==grantId||saved.revokedBy!==actor)throw new Error('Revocation unavailable or request key reused')
 return {id:grantId}
}
export async function listMyBoardPackets(db:D1Database,actorId:string|null){
 if(!actorId)throw new Error('Unauthorized')
 // Authorization is evaluated in the same SELECT that returns the frozen packet.
 const rows=(await db.prepare(`SELECT p.id,p.created_at AS createdAt,g.granted_at AS grantedAt,g.share_mode AS shareMode,CASE WHEN g.share_mode='summary' THEN g.summary_json ELSE v.packet END AS packet FROM board_packet_access_grants g JOIN board_packets p ON p.id=g.packet_id JOIN board_packet_previews v ON v.id=p.preview_id JOIN member_user_links l ON l.id=g.link_id AND l.user_id=g.user_id AND l.member_id=g.member_id AND l.revoked_at IS NULL JOIN members m ON m.id=l.member_id AND m.status='active' WHERE g.user_id=? AND NOT EXISTS(SELECT 1 FROM board_packet_access_revocations r WHERE r.grant_id=g.id) ORDER BY g.granted_at DESC,g.id`).bind(actorId).all<{id:string;createdAt:string;grantedAt:string;packet:string;shareMode:'full'|'summary'}>()).results
 return rows.map(row=>row.shareMode==='summary'?{...row,shareMode:'summary' as const,packet:boardPacketSummary(JSON.parse(row.packet))}:{...row,shareMode:'full' as const,packet:JSON.parse(row.packet) as Packet})
}
