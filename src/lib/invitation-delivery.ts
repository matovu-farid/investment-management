export type InvitationDeliveryEnvironment = { RESEND_API_KEY?: string; PASSWORD_RESET_FROM?: string; INVITATION_FROM?: string }

// A provider acceptance means the message was queued, not that it reached the inbox.
export function createInvitationDelivery(env: InvitationDeliveryEnvironment, baseURL: string, fetcher: typeof fetch = fetch) {
  const sender = env.INVITATION_FROM || env.PASSWORD_RESET_FROM
  const key = env.RESEND_API_KEY
  if (!key || /\s/.test(key) || !sender || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(sender)) return null
  let origin: URL
  try { origin = new URL(baseURL) } catch { return null }
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === 'localhost'))) return null
  return async ({ email, token }: { email: string; token: string }) => {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid invitation')
    const link = `${origin.origin}/accept-invitation#${token}`
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender, to: [email], subject: 'Your RNIG member invitation', text: `You have been invited to access the RNIG workspace. Use the link below to set your password. This link can be used once and expires in 24 hours.\n\n${link}\n\nIf you were not expecting this invitation, you can ignore this email.` }),
      })
      if (!response.ok) throw new Error('Delivery unavailable')
    } catch { throw new Error('Delivery unavailable') }
  }
}
