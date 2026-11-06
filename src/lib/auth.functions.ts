import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth, passwordRecoveryEnabled } from './auth'

export const getSession = createServerFn({ method: 'GET' }).handler(async () =>
  auth.api.getSession({ headers: getRequestHeaders() }),
)

export const getPasswordRecoveryAvailability = createServerFn({ method: 'GET' }).handler(async () => passwordRecoveryEnabled)
