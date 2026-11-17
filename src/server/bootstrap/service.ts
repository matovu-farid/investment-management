import { hashPassword } from 'better-auth/crypto'

export async function bootstrapAvailable(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS available WHERE NOT EXISTS(SELECT 1 FROM first_admin_bootstrap) AND NOT EXISTS(SELECT 1 FROM "user")').first<{ available: number }>()
  return row?.available === 1
}

export async function createFirstAdmin(db: D1Database, input: unknown, clientIp: string | null) {
  if (!clientIp || clientIp.length > 64 || !/^[0-9a-fA-F:.]+$/.test(clientIp)) throw new Error('Initial setup is unavailable')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid details')
  const { name, email, password } = input as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 ||
      typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Invalid details')
  if (!await bootstrapAvailable(db)) throw new Error('Initial setup is unavailable')
  const ipKey = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIp)))).map(x => x.toString(16).padStart(2, '0')).join('')
  const quota = await db.batch([
    db.prepare('INSERT INTO first_admin_rate_limits(key,count,window_start) VALUES (?,1,unixepoch()) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<=unixepoch()-60 THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<=unixepoch()-60 THEN unixepoch() ELSE window_start END RETURNING count').bind(ipKey),
    db.prepare('INSERT INTO first_admin_rate_limits(key,count,window_start) SELECT \'global\',1,unixepoch() WHERE EXISTS(SELECT 1 FROM first_admin_rate_limits WHERE key=? AND count<=10 AND window_start>unixepoch()-60) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<=unixepoch()-60 THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<=unixepoch()-60 THEN unixepoch() ELSE window_start END RETURNING count').bind(ipKey),
  ])
  if (quota.length !== 2 || quota.some((q, i) => { const count = (q.results[0] as {count?: unknown} | undefined)?.count; return typeof count !== 'number' || count > (i === 0 ? 10 : 100) })) throw new Error('Too many attempts. Please try again later.')
  const userId = crypto.randomUUID(), accountId = crypto.randomUUID(), hash = await hashPassword(password), now = Date.now()
  try {
    const results = await db.batch([
      db.prepare('INSERT INTO first_admin_bootstrap(singleton,user_id) SELECT 1,? WHERE NOT EXISTS(SELECT 1 FROM "user") RETURNING user_id').bind(userId),
      db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) SELECT ?,?,?,0,?,? WHERE EXISTS(SELECT 1 FROM first_admin_bootstrap WHERE singleton=1 AND user_id=?)').bind(userId,name.trim(),email.trim().toLowerCase(),now,now,userId),
      db.prepare('INSERT INTO "account"(id,accountId,providerId,userId,password,createdAt,updatedAt) SELECT ?,?,\'credential\',?,?,?,? WHERE EXISTS(SELECT 1 FROM first_admin_bootstrap WHERE singleton=1 AND user_id=?)').bind(accountId,userId,userId,hash,now,now,userId),
      db.prepare('INSERT INTO app_user_roles(user_id,role,granted_by) SELECT ?,\'admin\',\'first-user-bootstrap\' WHERE EXISTS(SELECT 1 FROM first_admin_bootstrap WHERE singleton=1 AND user_id=?)').bind(userId,userId),
    ])
    if ((results[0].results[0] as { user_id?: string } | undefined)?.user_id !== userId) throw new Error('Initial setup is unavailable')
  } catch { throw new Error('Initial setup is unavailable') }
  return { success: true as const }
}
