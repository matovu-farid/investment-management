import type { Member, MemberRepository } from './service'

export function createMemberRepository(db: D1Database): MemberRepository {
  return {
    async roleFor(userId) {
      const row = await db.prepare('SELECT role FROM app_user_roles WHERE user_id = ?').bind(userId).first<{ role: string }>()
      return row?.role ?? null
    },
    async list(actorId) {
      const guard = "EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
      const [result, authority] = await db.batch([
        db.prepare(`SELECT id, member_number AS memberNumber, full_name AS fullName, email, status, created_by AS createdBy, created_at AS createdAt FROM members WHERE ${guard} ORDER BY full_name, id`).bind(actorId),
        db.prepare(`SELECT 1 WHERE ${guard}`).bind(actorId),
      ])
      if (!authority.results.length) throw new Error('Unauthorized')
      return result.results as Member[]
    },
    async create(member) {
      const saved = await db.prepare("INSERT INTO members (id, member_number, full_name, email, status, created_by) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') RETURNING id")
        .bind(member.id, member.memberNumber, member.fullName, member.email, member.status, member.createdBy, member.createdBy).first<{id:string}>()
      if (!saved) throw new Error('Unauthorized')
      return member
    },
  }
}
