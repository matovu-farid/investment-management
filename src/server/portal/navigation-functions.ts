import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, setResponseHeader } from '@tanstack/react-start/server'

/** Navigation is only a presentation hint; each destination still checks authorization. */
export const getNavigationAccessFn = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const [{ env }, { auth }] = await Promise.all([import('cloudflare:workers'), import('../../lib/auth')])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session?.user.id) return null
  const row = await env.DB.prepare(`SELECT
    EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AS isAdmin,
    EXISTS(SELECT 1 FROM member_user_links l JOIN members m ON m.id=l.member_id
      WHERE l.user_id=? AND l.revoked_at IS NULL AND m.status='active') AS hasMemberLink`)
    .bind(session.user.id, session.user.id).first<{ isAdmin: number; hasMemberLink: number }>()
  if (!row) return null
  return { role: row.isAdmin ? 'admin' as const : 'member' as const, hasMemberLink: !!row.hasMemberLink }
})
