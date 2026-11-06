export type ShareEvent = { id: string; memberId: string | null; jointHoldingId: string | null; eventType: string; shares: number; eventDate: string; reference: string | null; notes: string | null; createdBy: string; requestId: string; holderName?: string; voidedAt?: string | null; voidReason?: string | null }
export type ReviewedMember = {id:string;memberNumber:string;fullName:string}
export type JointHolding = { id: string; name: string; memberIds: string[]; members: ReviewedMember[]; createdBy: string; requestId: string }
export type ShareRegister = { members: { id: string; fullName: string; memberNumber: string; status: string }[]; holdings: { id: string; name: string; members: string }[]; events: ShareEvent[] }
export interface SharesRepository { roleFor(id: string): Promise<string | null>; list(actor: string): Promise<ShareRegister>; createEvent(event: ShareEvent): Promise<ShareEvent>; createJoint(holding: JointHolding): Promise<JointHolding> }
async function admin(repo: SharesRepository, actor: string | null): Promise<string> { if (!actor || await repo.roleFor(actor) !== 'admin') throw new Error('Unauthorized'); return actor }
function object(input: unknown): Record<string, unknown> { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid input'); return input as Record<string, unknown> }
function text(value: unknown, max: number, optional = false): string | null { if ((value == null || value === '') && optional) return null; if (typeof value !== 'string') throw new Error('Invalid input'); const result = value.trim(); if (!result || result.length > max) { if (optional && !result) return null; throw new Error('Invalid input') } return result }
export async function listShares(repo: SharesRepository, actor: string | null) { const id=await admin(repo, actor); return repo.list(id) }
export async function createShareEvent(repo: SharesRepository, actor: string | null, input: unknown) {
  const createdBy = await admin(repo, actor), value = object(input)
  const memberId = text(value.memberId, 128, true), jointHoldingId = text(value.jointHoldingId, 128, true)
  const eventType = text(value.eventType, 32)!, eventDate = text(value.eventDate, 10)!
  const requestId = text(value.requestId, 128)!
  const shares = value.shares
  if (Boolean(memberId) === Boolean(jointHoldingId) || !['opening','issue','bonus','purchase','sale','exit','adjustment'].includes(eventType) || !Number.isSafeInteger(shares) || (shares as number) <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate)) || new Date(eventDate).toISOString().slice(0,10) !== eventDate) throw new Error('Invalid share event')
  return repo.createEvent({ id: crypto.randomUUID(), memberId, jointHoldingId, eventType, shares: shares as number, eventDate, reference: text(value.reference, 200, true), notes: text(value.notes, 2000, true), createdBy, requestId })
}
export async function createJointHolding(repo: SharesRepository, actor: string | null, input: unknown) {
  const createdBy = await admin(repo, actor), value = object(input), name = text(value.name, 200)!, requestId = text(value.requestId, 128)!
  if (!Array.isArray(value.members) || value.members.length < 2 || value.members.length > 100) throw new Error('Invalid joint holding')
  const members = value.members.map(item => { const m=object(item); return {id:text(m.id,128)!,memberNumber:text(m.memberNumber,64)!,fullName:text(m.fullName,200)!} }).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  if (new Set(members.map(m=>m.id)).size !== members.length) throw new Error('Invalid joint holding')
  return repo.createJoint({ id: crypto.randomUUID(), name, memberIds: members.map(m=>m.id), members, createdBy, requestId })
}
