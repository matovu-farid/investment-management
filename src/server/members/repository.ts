import type { Member, MemberRepository } from './service'

export function createMemberRepository(db: D1Database): MemberRepository {
  return {
    async roleFor(userId) {
      const row = await db.prepare('SELECT role FROM app_user_roles WHERE user_id = ?').bind(userId).first<{ role: string }>()
      return row?.role ?? null
    },
    async list() {
      const result = await db.prepare('SELECT id, member_number AS memberNumber, full_name AS fullName, email, status, created_by AS createdBy, created_at AS createdAt FROM members ORDER BY full_name, id').all<Member>()
      return result.results
    },
    async create(member) {
      await db.prepare('INSERT INTO members (id, member_number, full_name, email, status, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(member.id, member.memberNumber, member.fullName, member.email, member.status, member.createdBy).run()
      return member
    },
  }
}
