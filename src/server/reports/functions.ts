import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { reportForPeriod } from './service'
export const reportForPeriodFn = createServerFn({ method: 'GET' }).validator((value: unknown) => value).handler(async ({ data }) => {
  const [{ env }, { auth }, { createReportRepository }] = await Promise.all([import('cloudflare:workers'), import('../../lib/auth'), import('./repository')])
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return reportForPeriod(createReportRepository(env.DB), session?.user.id ?? null, data)
})
