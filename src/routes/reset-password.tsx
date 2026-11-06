import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { getPasswordRecoveryAvailability } from '#/lib/auth.functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/reset-password')({
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  head: () => ({ meta: [{ name: 'referrer', content: 'no-referrer' }] }),
  loader: () => getPasswordRecoveryAvailability(),
  component: ResetPassword,
})

function ResetPassword() {
  const available = Route.useLoaderData()
  const [token, setToken] = useState(''), [ready, setReady] = useState(false)
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false), [success, setSuccess] = useState(false), [error, setError] = useState('')
  const captured = useRef(false)
  useEffect(() => {
    if (captured.current) return
    captured.current = true
    const fragment = window.location.hash.slice(1)
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (/^[A-Za-z0-9]{24}$/.test(fragment)) setToken(fragment)
    setReady(true)
  }, [])
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!available || !ready || !token || busy) return
    if (password !== confirmation) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const result = await authClient.resetPassword({ newPassword: password, token })
      if (result.error) throw new Error('Reset unavailable')
      setToken(''); setPassword(''); setConfirmation(''); setSuccess(true)
    } catch { setPassword(''); setConfirmation(''); setError('This link could not be used. It may have expired or already been used. Request another link or contact your administrator.') }
    finally { setBusy(false) }
  }
  return <main className="dashboard flex min-h-screen items-center justify-center"><div className="login-form w-full max-w-lg">
    <p className="eyebrow">MEMBER PORTAL</p><h1>Choose a new password</h1>
    {!available ? <p>Password recovery is not available yet. Please contact your administrator.</p> : success ? <p>Your password has been changed. Please sign in with your new password.</p> : !ready ? <p>Checking the reset link…</p> : !token ? <p>This reset link is missing or invalid. Request a new link or contact your administrator.</p> : <>
      <p>Use at least 12 characters for your new password.</p>
      <form method="post" onSubmit={submit}><FieldGroup>
        <Field><FieldLabel htmlFor="reset-password">New password</FieldLabel><Input id="reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></Field>
        <Field><FieldLabel htmlFor="reset-confirmation">Confirm password</FieldLabel><Input id="reset-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></Field>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button type="submit" disabled={!ready || busy}>{busy ? 'Updating…' : 'Update password'}</Button>
      </FieldGroup></form>
    </>}
    <p className="help"><Link to="/login">Back to sign in</Link>{available && !success && <> · <Link to="/forgot-password">Request a new link</Link></>}</p>
  </div></main>
}
