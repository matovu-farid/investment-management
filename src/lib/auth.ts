import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'

// Sign-up is disabled at the auth API, not just hidden in the UI. Accounts are
// provisioned through administrator invitations or controlled test setup.
export const auth = betterAuth({
  database: env.DB,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: false },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
})
