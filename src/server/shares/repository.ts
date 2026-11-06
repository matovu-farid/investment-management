import type { SharesRepository, ShareEvent } from './service'
const admin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
export function createSharesRepository(db: D1Database): SharesRepository { return {
  async roleFor(id) { return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id = ?').bind(id).first<{role: string}>())?.role ?? null },
  async list(actor) {
    const [members, holdings, events, authority] = await db.batch([
      db.prepare(`SELECT id,full_name AS fullName,member_number AS memberNumber,status FROM members WHERE ${admin} ORDER BY full_name,id`).bind(actor),
      db.prepare(`SELECT j.id,j.name,GROUP_CONCAT(m.full_name, ', ') AS members FROM joint_shareholdings j JOIN joint_shareholding_members jm ON jm.shareholding_id=j.id JOIN members m ON m.id=jm.member_id WHERE ${admin} GROUP BY j.id ORDER BY j.name,j.id`).bind(actor),
      db.prepare(`SELECT e.id,e.member_id AS memberId,e.joint_shareholding_id AS jointHoldingId,e.event_type AS eventType,e.shares,e.event_date AS eventDate,e.reference,e.notes,e.created_by AS createdBy,e.request_id AS requestId,COALESCE(m.full_name,j.name) AS holderName,v.created_at AS voidedAt,v.reason AS voidReason FROM share_events e LEFT JOIN share_event_voids v ON v.event_id=e.id LEFT JOIN members m ON m.id=e.member_id LEFT JOIN joint_shareholdings j ON j.id=e.joint_shareholding_id WHERE ${admin} ORDER BY e.event_date DESC,e.created_at DESC`).bind(actor),
      db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor),
    ])
    if (!authority.results.length) throw new Error('Unauthorized')
    return {members:members.results as {id:string;fullName:string;memberNumber:string;status:string}[], holdings:holdings.results as {id:string;name:string;members:string}[], events:events.results as ShareEvent[]}
  },
  async createEvent(e) {
    const find=()=>db.prepare(`SELECT e.id,e.member_id AS memberId,e.joint_shareholding_id AS jointHoldingId,e.event_type AS eventType,e.shares,e.event_date AS eventDate,e.reference,e.notes,e.created_by AS createdBy,e.request_id AS requestId,v.created_at AS voidedAt FROM share_events e LEFT JOIN share_event_voids v ON v.event_id=e.id WHERE e.request_id=? AND ${admin}`).bind(e.requestId,e.createdBy).first<ShareEvent>()
    let saved=await find()
    if(!saved){try{await db.prepare(`INSERT INTO share_events (id,member_id,joint_shareholding_id,event_type,shares,event_date,reference,notes,created_by,request_id) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${admin} AND NOT EXISTS(SELECT 1 FROM share_events WHERE request_id=?)`).bind(e.id,e.memberId,e.jointHoldingId,e.eventType,e.shares,e.eventDate,e.reference,e.notes,e.createdBy,e.requestId,e.createdBy,e.requestId).run()}catch(error){saved=await find();if(!saved)throw error}saved=await find()}
    if(saved?.voidedAt)throw new Error('Previously recorded share event is void')
    if(!saved)throw new Error('Unauthorized or event unavailable')
    if(['memberId','jointHoldingId','eventType','shares','eventDate','reference','notes','createdBy'].some(k=>saved![k as keyof ShareEvent]!==e[k as keyof ShareEvent]))throw new Error('Request ID already used for different event')
    return saved
  },
  async createJoint(h) {
    type Saved={id:string;name:string;createdBy:string;requestId:string;reviewedMembers:string|null}
    const reviewed=JSON.stringify([...h.members].sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const find=()=>db.prepare(`SELECT id,name,created_by AS createdBy,request_id AS requestId,reviewed_members AS reviewedMembers FROM joint_shareholdings WHERE request_id=? AND ${admin}`).bind(h.requestId,h.createdBy).first<Saved>()
    async function confirm(row:Saved){const members=await db.prepare(`SELECT member_id AS id FROM joint_shareholding_members WHERE shareholding_id=? AND ${admin} ORDER BY member_id`).bind(row.id,h.createdBy).all<{id:string}>();if(row.name!==h.name||row.createdBy!==h.createdBy||row.reviewedMembers!==reviewed||JSON.stringify(members.results.map(x=>x.id))!==JSON.stringify([...h.memberIds].sort()))throw new Error('Request ID already used for different holding');return {id:row.id,name:row.name,createdBy:row.createdBy,requestId:row.requestId,memberIds:members.results.map(x=>x.id),members:h.members}}
    let existing=await find();if(existing)return confirm(existing)
    try{await db.batch([
      db.prepare(`INSERT INTO joint_shareholdings(id,name,created_by,request_id,reviewed_members) SELECT ?,?,?,?,? WHERE ${admin} AND NOT EXISTS(SELECT 1 FROM joint_shareholdings WHERE request_id=?)`).bind(h.id,h.name,h.createdBy,h.requestId,reviewed,h.createdBy,h.requestId),
      ...h.memberIds.map(id=>db.prepare(`INSERT INTO joint_shareholding_members(shareholding_id,member_id,created_by) SELECT ?,?,? WHERE ${admin} AND EXISTS(SELECT 1 FROM joint_shareholdings WHERE id=?)`).bind(h.id,id,h.createdBy,h.createdBy,h.id)),
    ])}catch(error){existing=await find();if(existing)return confirm(existing);throw error}
    existing=await find();if(!existing)throw new Error('Unauthorized or reviewed members changed or unavailable');return confirm(existing)
  },
} }
