import {hashPassword} from 'better-auth/crypto'
type Input = Record<string,unknown>
function input(v:unknown):Input {if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid request');return v as Input}
function id(v:unknown,max=128){if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>max)throw new Error('Invalid request');return v}
async function admin(db:D1Database,actor:string|null){if(!actor||(await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized');return actor}
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('')}
function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('')}
async function rate(db:D1Database,keys:{key:string;max:number}[]){
 // D1 executes a batch as one transaction. Only consume a later quota when
 // the previous quota admitted the request, including under concurrent calls.
 const results=await db.batch(keys.map(({key},i)=>{
  const guard=i===0?'1':'EXISTS(SELECT 1 FROM invitation_rate_limits WHERE key=? AND count<=? AND window_start>unixepoch()-60)'
  const statement=db.prepare(`INSERT INTO invitation_rate_limits(key,count,window_start) SELECT ?,1,unixepoch() WHERE ${guard} ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<=unixepoch()-60 THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<=unixepoch()-60 THEN unixepoch() ELSE window_start END RETURNING count`)
  return i===0?statement.bind(key):statement.bind(key,keys[i-1].key,keys[i-1].max)
 }))
 if(results.length!==keys.length || results.some((r,i)=>{const count=(r.results[0] as {count?:unknown}|undefined)?.count;return typeof count!=='number'||!Number.isSafeInteger(count)||count>keys[i].max}))throw new Error('Too many attempts. Please try again later.')
}
export async function issueInvitation(db:D1Database,actorId:string|null,data:unknown){const actor=await admin(db,actorId);await rate(db,[{key:`issue:${actor}`,max:10}]);const v=input(data),memberId=id(v.memberId),memberName=id(v.expectedMemberName,200),memberNumber=id(v.expectedMemberNumber,64);if(typeof v.email!=='string')throw new Error('Invalid email');const email=v.email.trim().toLowerCase();if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Invalid email');const token=randomToken(),invitationId=crypto.randomUUID();await db.prepare('INSERT INTO member_invitations(id,token_digest,member_id,email,issued_by,expires_at,reviewed_member_name,reviewed_member_number) VALUES(?,?,?,?,?,unixepoch()+86400,?,?)').bind(invitationId,await digest(token),memberId,email,actor,memberName,memberNumber).run();const row=await db.prepare("SELECT expires_at AS expiresAt FROM member_invitations WHERE id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(invitationId,actor).first<{expiresAt:number}>();if(!row)throw new Error('Invitation creation not confirmed');return {id:invitationId,token,email,expiresAt:row.expiresAt}}
export async function issueAndDeliverInvitation(db:D1Database,actorId:string|null,data:unknown,delivery:((input:{email:string;token:string})=>Promise<void>)|null){
 const invitation=await issueInvitation(db,actorId,data)
 let deliveryStatus:'accepted'|'unavailable'|'unconfirmed'='unavailable'
 if(delivery){try{await delivery({email:invitation.email,token:invitation.token});deliveryStatus='accepted'}catch{deliveryStatus='unconfirmed'}}
 return {id:invitation.id,token:invitation.token,expiresAt:invitation.expiresAt,deliveryStatus}
}
export async function listInvitations(db:D1Database,actorId:string|null){const actor=await admin(db,actorId);const [invites,members,authority]=await db.batch([db.prepare(`SELECT i.id,i.member_id AS memberId,COALESCE(i.reviewed_member_name,m.full_name) AS memberName,COALESCE(i.reviewed_member_number,m.member_number) AS memberNumber,i.email,i.expires_at AS expiresAt,i.created_at AS createdAt,CASE WHEN c.invitation_id IS NOT NULL THEN 'claimed' WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at<=unixepoch() THEN 'expired' WHEN x.invitation_id IS NOT NULL OR i.reviewed_member_name IS NULL OR i.reviewed_member_number IS NULL THEN 'review required' ELSE 'pending' END AS status FROM member_invitations i JOIN members m ON m.id=i.member_id LEFT JOIN member_invitation_claims c ON c.invitation_id=i.id LEFT JOIN invitation_identity_invalidations x ON x.invitation_id=i.id WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY i.created_at DESC,i.id`).bind(actor),db.prepare("SELECT m.id,m.full_name AS fullName,m.member_number AS memberNumber FROM members m WHERE m.status='active' AND NOT EXISTS(SELECT 1 FROM member_user_links l WHERE l.member_id=m.id AND l.revoked_at IS NULL) AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY m.full_name,m.id").bind(actor),db.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor)]);if(!authority.results.length)throw new Error('Unauthorized');return {invitations:invites.results as {id:string;memberId:string;memberName:string;memberNumber:string;email:string;expiresAt:number;createdAt:number;status:'pending'|'expired'|'revoked'|'claimed'|'review required'}[],members:members.results as {id:string;fullName:string;memberNumber:string}[]}}
export async function revokeInvitation(db:D1Database,actorId:string|null,data:unknown){const actor=await admin(db,actorId),invitationId=id(input(data).id);const result=await db.prepare('UPDATE member_invitations SET revoked_at=unixepoch(),revoked_by=? WHERE id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role=\'admin\') AND NOT EXISTS (SELECT 1 FROM member_invitation_claims WHERE invitation_id=member_invitations.id)').bind(actor,invitationId,actor).run();if(!result.meta.changes)throw new Error('Invitation unavailable or already revoked');return {id:invitationId}}
export async function issueStaffInvitation(db:D1Database,actorId:string|null,data:unknown,delivery:((input:{email:string;token:string})=>Promise<void>)|null){
 const actor=await admin(db,actorId);await rate(db,[{key:`issue:${actor}`,max:10}]);const v=input(data),name=id(v.name,200)
 if(typeof v.email!=='string')throw new Error('Invalid email');const email=v.email.trim().toLowerCase()
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||(v.role!=='admin'&&v.role!=='standard'))throw new Error('Invalid request')
 const token=randomToken(),invitationId=crypto.randomUUID()
 await db.prepare('INSERT INTO staff_invitations(id,token_digest,name,email,role,issued_by,expires_at) VALUES(?,?,?,?,?,?,unixepoch()+86400)').bind(invitationId,await digest(token),name,email,v.role,actor).run()
 const row=await db.prepare("SELECT expires_at AS expiresAt FROM staff_invitations WHERE id=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(invitationId,actor).first<{expiresAt:number}>()
 if(!row)throw new Error('Invitation creation not confirmed')
 let deliveryStatus:'accepted'|'unavailable'|'unconfirmed'='unavailable'
 if(delivery){try{await delivery({email,token});deliveryStatus='accepted'}catch{deliveryStatus='unconfirmed'}}
 return {id:invitationId,token,expiresAt:row.expiresAt,deliveryStatus}
}
export async function listStaffInvitations(db:D1Database,actorId:string|null){
 const actor=await admin(db,actorId)
 const rows=await db.prepare(`SELECT i.id,i.name,i.email,i.role,i.expires_at AS expiresAt,CASE WHEN c.invitation_id IS NOT NULL THEN 'claimed' WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at<=unixepoch() THEN 'expired' ELSE 'pending' END AS status FROM staff_invitations i LEFT JOIN staff_invitation_claims c ON c.invitation_id=i.id WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY i.created_at DESC,i.id`).bind(actor).all<{id:string;name:string;email:string;role:'admin'|'standard';expiresAt:number;status:'claimed'|'revoked'|'expired'|'pending'}>()
 await admin(db,actorId);return rows.results
}
export async function revokeStaffInvitation(db:D1Database,actorId:string|null,data:unknown){
 const actor=await admin(db,actorId),invitationId=id(input(data).id)
 const result=await db.prepare("UPDATE staff_invitations SET revoked_at=unixepoch(),revoked_by=? WHERE id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND NOT EXISTS(SELECT 1 FROM staff_invitation_claims WHERE invitation_id=staff_invitations.id)").bind(actor,invitationId,actor).run()
 if(!result.meta.changes)throw new Error('Invitation unavailable or already revoked');return {id:invitationId}
}
export async function claimInvitation(db:D1Database,data:unknown,clientIp:string|null){
 if(!clientIp||clientIp.length>64||!/^[0-9a-fA-F:.]+$/.test(clientIp))throw new Error('Invitation unavailable.');
 await rate(db,[{key:`claim:${await digest(clientIp)}`,max:10},{key:'claim:global',max:100}]);
 const v=input(data);if(typeof v.token!=='string'||!/^[a-f0-9]{64}$/.test(v.token)||typeof v.password!=='string'||v.password.length<12||v.password.length>128)throw new Error('Invitation unavailable.');
 const tokenDigest=await digest(v.token)
 let invitation=await db.prepare('SELECT id FROM member_invitations WHERE token_digest=? AND revoked_at IS NULL AND expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM member_invitation_claims c WHERE c.invitation_id=member_invitations.id)').bind(tokenDigest).first<{id:string}>();let staff=false
 if(!invitation){invitation=await db.prepare('SELECT id FROM staff_invitations WHERE token_digest=? AND revoked_at IS NULL AND expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM staff_invitation_claims c WHERE c.invitation_id=staff_invitations.id)').bind(tokenDigest).first<{id:string}>();staff=true}
 if(!invitation)throw new Error('Invitation unavailable.');
 const password=await hashPassword(v.password),userId=crypto.randomUUID(),accountId=crypto.randomUUID(),linkId=crypto.randomUUID(),now=Date.now()
 if(staff){try{await db.batch([
  db.prepare('INSERT INTO staff_invitation_claims(invitation_id,user_id) VALUES (?,?)').bind(invitation.id,userId),
  db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) SELECT ?,name,email,0,?,? FROM staff_invitations WHERE id=?').bind(userId,now,now,invitation.id),
  db.prepare('INSERT INTO "account"(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,\'credential\',?,?,?,?)').bind(accountId,userId,userId,password,now,now),
  db.prepare("INSERT INTO app_user_roles(user_id,role,granted_by) SELECT ?,'admin',issued_by FROM staff_invitations WHERE id=? AND role='admin'").bind(userId,invitation.id),
 ])}catch{throw new Error('Invitation unavailable.')}return {success:true as const}}
 try{await db.batch([
  db.prepare('INSERT INTO member_invitation_claims(invitation_id,user_id) VALUES (?,?)').bind(invitation.id,userId),
  db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) SELECT ?,m.full_name,i.email,0,?,? FROM member_invitations i JOIN members m ON m.id=i.member_id WHERE i.id=?').bind(userId,now,now,invitation.id),
  db.prepare('INSERT INTO "account"(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,\'credential\',?,?,?,?)').bind(accountId,userId,userId,password,now,now),
  db.prepare('INSERT INTO member_user_links(id,user_id,member_id,linked_by) SELECT ?,?,member_id,issued_by FROM member_invitations WHERE id=?').bind(linkId,userId,invitation.id),
 ])}catch{throw new Error('Invitation unavailable.')}
 return {success:true as const}
}
