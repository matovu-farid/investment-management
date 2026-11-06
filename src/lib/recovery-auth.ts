import type { createRecoveryDelivery } from './recovery-delivery'

export function recoveryAuthSettings(
  delivery: ReturnType<typeof createRecoveryDelivery>,
  schedule: (promise: Promise<unknown>) => void,
) {
  return {
    enabled: true as const,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    ...(delivery ? { sendResetPassword: async ({ user, token }: { user: { email: string }; token: string }) => {
      // Do not include an address, token, message, or provider error in logs.
      schedule(delivery({ email: user.email, token }).catch(() => { console.error('Password recovery delivery failed') }))
    } } : {}),
  }
}
