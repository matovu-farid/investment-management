export type RecoveryEnvironment = {
  PASSWORD_RESET_ENABLED?: string
  PASSWORD_RESET_FROM?: string
  RESEND_API_KEY?: string
}

// Deliberately disabled until a sender, Resend API key, and opt-in are present.
export function createRecoveryDelivery(env: RecoveryEnvironment, baseURL: string, fetcher: typeof fetch = fetch) {
  if (env.PASSWORD_RESET_ENABLED !== 'true' || !env.RESEND_API_KEY || /\s/.test(env.RESEND_API_KEY) ||
      !env.PASSWORD_RESET_FROM || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(env.PASSWORD_RESET_FROM)) return null
  let origin: URL
  try { origin = new URL(baseURL) } catch { return null }
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === 'localhost'))) return null
  const sender = env.PASSWORD_RESET_FROM
  const apiKey = env.RESEND_API_KEY
  return async ({ email: recipient, token }: { email: string; token: string }) => {
    if (!/^[A-Za-z0-9]{24}$/.test(token)) throw new Error('Invalid recovery token')
    const link = `${origin.origin}/reset-password#${token}`
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [recipient], from: sender, subject: 'Reset your RNIG password',
          text: `Use this link to reset your RNIG password. It expires in 30 minutes and can be used once.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
        }),
      })
      if (!response.ok) throw new Error('Delivery unavailable')
    } catch { throw new Error('Delivery unavailable') }
  }
}
