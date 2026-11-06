import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { getPasswordRecoveryAvailability } from '#/lib/auth.functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/forgot-password')({
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  loader: () => getPasswordRecoveryAvailability(),
  component: ForgotPassword,
})

function ForgotPassword() {
  const available = Route.useLoaderData()
  const [email, setEmail] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setReady(true) }, [])
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!available || !ready || busy) return
    setBusy(true); setError('')
    try {
      const result = await authClient.requestPasswordReset({ email })
      if (result.error) throw new Error('Request unavailable')
      setEmail(''); setSent(true)
    } catch { setError('The request could not be completed. Please try again later or contact the administrator.') }
    finally { setBusy(false) }
  }
  return <main className="dashboard flex min-h-screen items-center justify-center"><div className="login-form w-full max-w-lg">
    <p className="eyebrow">MEMBER PORTAL</p><h1>Reset your password</h1>
    {!available ? <p>Password recovery is not available yet. Please contact your administrator.</p> : sent ? <p>If the address is associated with an account, check your inbox for a reset link. If it doesn’t arrive, contact your administrator.</p> : <>
      <p>Enter your account email address and we’ll send a reset link if the account exists.</p>
      <form method="post" onSubmit={submit}><FieldGroup><Field><FieldLabel htmlFor="recovery-email">Email address</FieldLabel><Input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></Field>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" disabled={!ready || busy}>{busy ? 'Requesting…' : 'Send reset link'}</Button></FieldGroup></form>
    </>}
    <p className="help"><Link to="/login">Back to sign in</Link></p>
  </div></main>
}
