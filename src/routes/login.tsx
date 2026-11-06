import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSession, getPasswordRecoveryAvailability } from '#/lib/auth.functions'
import { authClient } from '#/lib/auth-client'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/login')({ beforeLoad: async () => { if (await getSession()) throw redirect({ to: '/' }) }, loader: () => getPasswordRecoveryAvailability(), component: Login })
function Login() {
  const recoveryAvailable = Route.useLoaderData()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { const result = await authClient.signIn.email({ email, password }); if (result.error) setError('Unable to sign in. Check your email and password.'); else window.location.href = '/' } catch { setError('Unable to sign in right now. Please try again.') } finally { setBusy(false) } }
  return <div className="login-page"><div className="login-story"><div className="brand light"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></div><div><p className="eyebrow">INVESTING TOGETHER</p><h1>Building a stronger future, together.</h1><p>One place to stay connected to your group's investments and progress.</p></div><p className="story-footer">Rats Network Investment Group</p></div><main className="login-main"><div className="login-form"><p className="eyebrow">MEMBER PORTAL</p><h2>Welcome back</h2><p>Sign in to your account to continue.</p><form method="post" onSubmit={submit}><FieldGroup><Field><FieldLabel htmlFor="email">Email address</FieldLabel><Input id="email" className="h-12" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field><Field><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" className="h-12" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}<Button className="h-12 w-full" type="submit" disabled={!ready || busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></FieldGroup></form>{recoveryAvailable && <p className="help"><Link to="/forgot-password">Forgot your password?</Link></p>}<p className="help">Need access? Contact your group administrator.</p></div></main></div>
}
