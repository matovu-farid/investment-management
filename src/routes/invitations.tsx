import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { formatInvitationExpiry } from '#/lib/invitation-expiry'
import { issueInvitationFn, listInvitationsFn, revokeInvitationFn } from '#/server/invitations/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'

export const Route = createFileRoute('/invitations')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  loader: async () => listInvitationsFn(),
  component: Invitations,
})
function Invitations() {
  const { invitations, members } = Route.useLoaderData()
  const router = useRouter()
  const [memberId, setMemberId] = useState('')
  const [email, setEmail] = useState('')
  const [review, setReview] = useState<{ memberId:string; memberName:string; memberNumber:string; email:string } | null>(null)
  const [issued, setIssued] = useState<{ link: string; expiresAt: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function refresh() {
    try { await router.invalidate() } catch { setError('The change was saved, but the list could not refresh. Reload this page.') }
  }
  function prepare(event: React.FormEvent) {
    event.preventDefault()
    const member=members.find(m=>m.id===memberId)
    if (!member) return
    setReview({memberId:member.id,memberName:member.fullName,memberNumber:member.memberNumber,email:email.trim().toLowerCase()})
  }
  async function issue() {
    if (issued || busy || !review) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await issueInvitationFn({ data: { memberId:review.memberId, email:review.email, expectedMemberName:review.memberName, expectedMemberNumber:review.memberNumber } })
      const link = new URL('/accept-invitation', window.location.origin)
      link.hash = result.token
      setIssued({ link: link.href, expiresAt: result.expiresAt })
      setMemberId(''); setEmail(''); setReview(null)
      await refresh()
    } catch {
      setError('The invitation could not be confirmed. It may have been created; check the list, revoke it if necessary, and issue a new invitation.')
      await refresh()
    } finally { setBusy(false) }
  }
  async function revoke(id: string) {
    if (busy || !window.confirm('Revoke this invitation? Its link will no longer work.')) return
    setBusy(true); setError(''); setMessage('')
    try {
      await revokeInvitationFn({ data: { id } })
      setMessage('Invitation revoked.')
      await refresh()
    } catch {
      setError('Revocation could not be confirmed. Refresh the list and check its status.')
      await refresh()
    } finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Member invitations</h1><p>Issue a one-use invitation to an existing member. Verify the member and email address before creating it. No email is sent automatically. Previously issued, unclaimed links without an identity review require revocation and reissue. If a member’s name or number changes, their pending invitation requires reissue.</p>
    {error && <Alert variant="destructive" role="alert" className="mt-6"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status" className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}
    <Card className="mt-6"><CardHeader><CardTitle>Issue an invitation</CardTitle><CardDescription>The link grants access to the selected member’s records. Share it privately with the intended member. It expires after 24 hours and cannot be recovered after leaving this page.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">
      {issued && <Alert role="status"><AlertDescription><p><strong>Copy this link now.</strong> It will not be shown again. If it is lost, revoke the invitation and issue another.</p><Field className="mt-4"><FieldLabel htmlFor="invitation-link">Invitation link</FieldLabel><Input id="invitation-link" readOnly value={issued.link} onFocus={e => e.currentTarget.select()} /></Field><p className="mt-3">Expires: {formatInvitationExpiry(issued.expiresAt)}</p><Button className="mt-3" type="button" onClick={() => setIssued(null)}>I have saved the link</Button></AlertDescription></Alert>}
      {review ? <section aria-label="Review member invitation"><h3>Review before creating invitation</h3><p>Member: <strong>{review.memberName} · {review.memberNumber}</strong> · member ID {review.memberId}</p><p>Invitation email: <strong>{review.email}</strong></p><p>This link grants access to the member’s private records. No email is sent automatically.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !!issued} onClick={()=>void issue()}>{busy ? 'Working…' : 'Create reviewed invitation'}</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setReview(null)}>Edit</Button></div></section> : <form onSubmit={prepare} className="max-w-xl"><FieldGroup><Field><FieldLabel htmlFor="invite-member">Member</FieldLabel><NativeSelect id="invite-member" required value={memberId} onChange={e => setMemberId(e.target.value)} disabled={busy || !!issued}><NativeSelectOption value="">Select a member</NativeSelectOption>{members.map(m => <NativeSelectOption key={m.id} value={m.id}>{m.fullName} · {m.memberNumber}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="invite-email">Email address</FieldLabel><Input id="invite-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !!issued} /></Field><Field><Button disabled={busy || !!issued || !members.length}>Review invitation</Button></Field></FieldGroup></form>}
    </CardContent></Card><Card className="mt-6"><CardHeader><CardTitle>Invitation history</CardTitle><CardDescription>Review invitations and revoke links that should no longer be used.</CardDescription></CardHeader><CardContent>{invitations.length === 0 ? <p>No invitations recorded.</p> : <ul className="flex flex-col gap-3">{invitations.map(i => <li key={i.id} className="flex flex-wrap items-center gap-2"><span>{i.memberName} · {i.memberNumber} · {i.email}</span><Badge variant="secondary">{i.status}</Badge><span>expires {formatInvitationExpiry(i.expiresAt)}</span>{(i.status === 'pending' || i.status === 'expired' || i.status === 'review required') && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void revoke(i.id)}>Revoke</Button>}</li>)}</ul>}</CardContent></Card>
  </main></div>
}
