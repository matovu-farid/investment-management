type EmailMessage = { to: string; from: string; subject: string; text: string }
export type RecoveryEnvironment = {
  PASSWORD_RESET_ENABLED?: string
  PASSWORD_RESET_FROM?: string
  EMAIL?: { send(message: EmailMessage): Promise<unknown> }
}

// This is intentionally disabled unless an operator configures both a sender
// and a working Cloudflare Email Sending binding and opts in explicitly.
export function createRecoveryDelivery(env: RecoveryEnvironment, baseURL: string) {
  if (env.PASSWORD_RESET_ENABLED !== 'true' || !env.EMAIL || typeof env.EMAIL.send !== 'function' ||
      !env.PASSWORD_RESET_FROM || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(env.PASSWORD_RESET_FROM)) return null
  let origin: URL
  try { origin = new URL(baseURL) } catch { return null }
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === 'localhost'))) return null
  const sender = env.PASSWORD_RESET_FROM
  const email = env.EMAIL
  return async ({ email: recipient, token }: { email: string; token: string }) => {
    if (!/^[A-Za-z0-9]{24}$/.test(token)) throw new Error('Invalid recovery token')
    const link = `${origin.origin}/reset-password#${token}`
    await email.send({
      to: recipient,
      from: sender,
      subject: 'Reset your RNIG password',
      text: `Use this link to reset your RNIG password. It expires in 30 minutes and can be used once.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    })
  }
}
