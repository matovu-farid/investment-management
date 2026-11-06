import { env, waitUntil } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { createRecoveryDelivery, type RecoveryEnvironment } from './recovery-delivery'
import { recoveryAuthSettings } from './recovery-auth'

const recoveryDelivery = createRecoveryDelivery(env as typeof env & RecoveryEnvironment, env.BETTER_AUTH_URL)
export const passwordRecoveryEnabled = recoveryDelivery !== null

// Sign-up is disabled at the auth API, not just hidden in the UI. Accounts are
// provisioned through administrator invitations or controlled test setup.
export const auth = betterAuth({
  database: env.DB,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: recoveryAuthSettings(recoveryDelivery, waitUntil),
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
})
