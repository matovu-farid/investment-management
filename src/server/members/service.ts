export type Member = {
  id: string
  memberNumber: string
  fullName: string
  email: string | null
  status: 'active' | 'inactive'
  createdBy: string
  createdAt?: string
}

export interface MemberRepository {
  roleFor(userId: string): Promise<string | null>
  /** Must verify current admin authority in the same batch as the guarded read. */
  list(actorId: string): Promise<Member[]>
  create(member: Member): Promise<Member>
}

async function requireAdmin(repository: MemberRepository, actorId: string | null): Promise<string> {
  if (!actorId || await repository.roleFor(actorId) !== 'admin') throw new Error('Unauthorized')
  return actorId
}

function parseInput(input: unknown): { memberNumber: string; fullName: string; email: string | null } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid member input')
  const value = input as Record<string, unknown>
  if (typeof value.memberNumber !== 'string' || typeof value.fullName !== 'string') throw new Error('Invalid member input')
  const memberNumber = value.memberNumber.trim()
  const fullName = value.fullName.trim()
  if (!memberNumber || memberNumber.length > 64 || !fullName || fullName.length > 200) throw new Error('Invalid member input')
  if (value.email != null && typeof value.email !== 'string') throw new Error('Invalid member input')
  const email = typeof value.email === 'string' ? value.email.trim() || null : null
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Invalid member input')
  return { memberNumber, fullName, email }
}

export async function listMembers(repository: MemberRepository, actorId: string | null): Promise<Member[]> {
  if (!actorId) throw new Error('Unauthorized')
  return repository.list(actorId)
}

export async function createMember(repository: MemberRepository, actorId: string | null, input: unknown): Promise<Member> {
  const createdBy = await requireAdmin(repository, actorId)
  const data = parseInput(input)
  return repository.create({ id: crypto.randomUUID(), ...data, status: 'active', createdBy })
}
