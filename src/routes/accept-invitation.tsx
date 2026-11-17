import { SpinnerLabel } from '#/components/ui/spinner'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { claimInvitationFn } from '#/server/invitations/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/accept-invitation')({
  headers: () => ({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }),
  head: () => ({ meta: [{ name: 'referrer', content: 'no-referrer' }] }),
  component: AcceptInvitation,
})
function AcceptInvitation() {
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const captured = useRef(false)
  useEffect(() => {
    if (captured.current) return
    captured.current = true
    const fragment = window.location.hash.slice(1)
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    if (/^[0-9a-f]{64}$/.test(fragment)) setToken(fragment)
    setReady(true)
  }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password !== confirmation) { setError('Passwords do not match.'); return }
    if (!token || busy) return
    setBusy(true)
    try {
      await claimInvitationFn({ data: { token, password } })
      setToken(''); setPassword(''); setConfirmation(''); setSuccess(true)
    } catch {
      setPassword(''); setConfirmation('')
      setError('The invitation could not be accepted. If you already completed it, try signing in. Otherwise contact your administrator for a new link.')
    } finally { setBusy(false) }
  }
  return <div className="login-page"><div className="login-story"><div className="brand light"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></div><div><p className="eyebrow">INVESTING TOGETHER</p><h1>Building a stronger future, together.</h1><p>One place to stay connected to your group's investments and progress.</p></div><p className="story-footer">Rats Network Investment Group</p></div><main className="login-main"><div className="login-form"><p className="eyebrow">MEMBER PORTAL</p><h2>Accept invitation</h2>{success ? <><p>Your account has been created. Sign in using the email address your administrator used and the password you chose. If another account is already signed in on this device, sign out of it first.</p><Link to="/login">Go to sign in</Link></> : !ready ? <p>Checking the invitation link…</p> : !token ? <><p>This invitation link is missing or invalid. Contact your administrator for a new link.</p><Link to="/login">Go to sign in</Link></> : <><p>Choose a password for the account associated with this invitation.</p><form onSubmit={submit}><FieldGroup><Field><FieldLabel htmlFor="new-password">Password</FieldLabel><Input id="new-password" className="h-12" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /><p className="text-sm text-muted-foreground">Use at least 12 characters.</p></Field><Field><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><Input id="confirm-password" className="h-12" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></Field>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}<Button className="h-12 w-full" type="submit" disabled={busy}>{busy ? <SpinnerLabel>Create account</SpinnerLabel> : 'Create account'}</Button></FieldGroup></form><p className="help">If you have already accepted this invitation, <Link to="/login">sign in</Link>.</p></>}</div></main></div>
}
