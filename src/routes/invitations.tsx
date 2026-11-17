import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { confirmAction } from '#/components/confirmation-host'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { formatInvitationExpiry } from '#/lib/invitation-expiry'
import { issueInvitationFn, listInvitationsFn, revokeInvitationFn, issueStaffInvitationFn, listStaffInvitationsFn, revokeStaffInvitationFn } from '#/server/invitations/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'

export const Route = createFileRoute('/invitations')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => { const [member, staff] = await Promise.all([listInvitationsFn(), listStaffInvitationsFn()]); return { ...member, staff } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: Invitations,
})
function Invitations() {
  const { invitations, members, staff } = Route.useLoaderData()
  const router = useRouter()
  const [memberId, setMemberId] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffRole, setStaffRole] = useState<'standard'|'admin'>('standard')
  const [staffReview, setStaffReview] = useState<{name:string;email:string;role:'standard'|'admin'} | null>(null)
  const [email, setEmail] = useState('')
  const [review, setReview] = useState<{ memberId:string; memberName:string; memberNumber:string; email:string } | null>(null)
  const [issued, setIssued] = useState<{ link: string; expiresAt: number; deliveryStatus: 'accepted'|'unavailable'|'unconfirmed' } | null>(null)
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
      setIssued({ link: link.href, expiresAt: result.expiresAt, deliveryStatus: result.deliveryStatus })
      setMemberId(''); setEmail(''); setReview(null)
      await refresh()
    } catch {
      setError('The invitation could not be confirmed. It may have been created; check the list, revoke it if necessary, and issue a new invitation.')
      await refresh()
    } finally { setBusy(false) }
  }
  async function issueStaff() {
    if (issued || busy || !staffReview) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result=await issueStaffInvitationFn({data:staffReview})
      const link=new URL('/accept-invitation',window.location.origin); link.hash=result.token
      setIssued({link:link.href,expiresAt:result.expiresAt,deliveryStatus:result.deliveryStatus})
      setStaffName('');setStaffEmail('');setStaffReview(null)
      await refresh()
    } catch { setError('The invitation could not be confirmed. Check the list, revoke it if necessary, and issue a new invitation.'); await refresh() }
    finally {setBusy(false)}
  }
  async function revokeStaff(id:string) {
    if (busy || !await confirmAction('Revoke this invitation? Its link will no longer work.')) return
    setBusy(true);setError('');setMessage('')
    try {await revokeStaffInvitationFn({data:{id}});setMessage('Invitation revoked.');await refresh()}
    catch {setError('Revocation could not be confirmed. Refresh the list and check its status.');await refresh()}
    finally {setBusy(false)}
  }
  async function revoke(id: string) {
    if (busy || !await confirmAction('Revoke this invitation? Its link will no longer work.')) return
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
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Member invitations</h1><p>Issue a one-use invitation to an existing member. Verify the member and email address before creating it. The invitation is sent by email when delivery is configured. Previously issued, unclaimed links without an identity review require revocation and reissue. If a member’s name or number changes, their pending invitation requires reissue.</p>
    {error && <Alert variant="destructive" role="alert" className="mt-6"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status" className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}
    {issued && <Alert role="status"><AlertDescription><p><strong>{issued.deliveryStatus === 'accepted' ? 'Email accepted for delivery.' : issued.deliveryStatus === 'unavailable' ? 'Email delivery is not configured.' : 'Email delivery could not be confirmed.'}</strong> {issued.deliveryStatus === 'accepted' ? 'The provider accepted the email; inbox delivery is not guaranteed.' : 'Share the link privately with the intended member. The email may still arrive if delivery could not be confirmed.'}</p><p>Copy this link now if needed. It will not be shown again. If it is lost, revoke the invitation and issue another.</p><Field className="mt-4"><FieldLabel htmlFor="invitation-link">Invitation link</FieldLabel><Input id="invitation-link" readOnly value={issued.link} onFocus={e => e.currentTarget.select()} /></Field><p className="mt-3">Expires: {formatInvitationExpiry(issued.expiresAt)}</p><Button className="mt-3" type="button" onClick={() => setIssued(null)}>Done</Button></AlertDescription></Alert>}
    <Card className="mt-6"><CardHeader><CardTitle>Issue an invitation</CardTitle><CardDescription>The link grants access to the selected member’s records. It expires after 24 hours and cannot be recovered after leaving this page.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">

      {review ? <section aria-label="Review member invitation"><h3>Review before creating invitation</h3><p>Member: <strong>{review.memberName} · {review.memberNumber}</strong> · member ID {review.memberId}</p><p>Invitation email: <strong>{review.email}</strong></p><p>This link grants access to the member’s private records and will be sent to the email above when delivery is configured.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !!issued} onClick={()=>void issue()}>{busy ? <SpinnerLabel>Create reviewed invitation</SpinnerLabel> : 'Create reviewed invitation'}</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setReview(null)}>Edit</Button></div></section> : <form onSubmit={prepare} className="max-w-xl"><FieldGroup><Field><FieldLabel htmlFor="invite-member">Member</FieldLabel><NativeSelect id="invite-member" required value={memberId} onChange={e => setMemberId(e.target.value)} disabled={busy || !!issued}><NativeSelectOption value="">Select a member</NativeSelectOption>{members.map(m => <NativeSelectOption key={m.id} value={m.id}>{m.fullName} · {m.memberNumber}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="invite-email">Email address</FieldLabel><Input id="invite-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !!issued} /></Field><Field><Button disabled={busy || !!issued || !members.length}>Review invitation</Button></Field></FieldGroup></form>}
    </CardContent></Card><Card className="mt-6"><CardHeader><CardTitle>Invite a workspace account</CardTitle><CardDescription>Invite an administrator or a standard account without linking a member record. An administrator has full access. A standard account has no administrative privileges and cannot see private member records until linked.</CardDescription></CardHeader><CardContent>
      {staffReview ? <section aria-label="Review workspace invitation"><h3>Review before sending</h3><p>Name: <strong>{staffReview.name}</strong></p><p>Email: <strong>{staffReview.email}</strong></p><p>Access: <strong>{staffReview.role === 'admin' ? 'Administrator — full workspace access' : 'Standard — no administrator access'}</strong></p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !!issued} onClick={()=>void issueStaff()}>Send reviewed invitation</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setStaffReview(null)}>Edit</Button></div></section> : <form className="max-w-xl" onSubmit={e=>{e.preventDefault();setStaffReview({name:staffName.trim(),email:staffEmail.trim().toLowerCase(),role:staffRole})}}><FieldGroup><Field><FieldLabel htmlFor="staff-name">Name</FieldLabel><Input id="staff-name" required maxLength={200} value={staffName} onChange={e=>setStaffName(e.target.value)} disabled={busy || !!issued} /></Field><Field><FieldLabel htmlFor="staff-email">Email address</FieldLabel><Input id="staff-email" type="email" required maxLength={254} value={staffEmail} onChange={e=>setStaffEmail(e.target.value)} disabled={busy || !!issued} /></Field><Field><FieldLabel htmlFor="staff-role">Access</FieldLabel><NativeSelect id="staff-role" value={staffRole} onChange={e=>setStaffRole(e.target.value as 'standard'|'admin')} disabled={busy || !!issued}><NativeSelectOption value="standard">Standard account</NativeSelectOption><NativeSelectOption value="admin">Administrator</NativeSelectOption></NativeSelect></Field><Field><Button disabled={busy || !!issued}>Review invitation</Button></Field></FieldGroup></form>}
      {staff.length > 0 && <><h3 className="mt-6">Workspace invitation history</h3><ul className="flex flex-col gap-3">{staff.map(i=><li key={i.id} className="flex flex-wrap items-center gap-2"><span>{i.name} · {i.email} · {i.role === 'admin' ? 'Administrator' : 'Standard'}</span><Badge variant="secondary">{i.status}</Badge><span>expires {formatInvitationExpiry(i.expiresAt)}</span>{(i.status==='pending'||i.status==='expired') && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={()=>void revokeStaff(i.id)}>Revoke</Button>}</li>)}</ul></>}
    </CardContent></Card><Card className="mt-6"><CardHeader><CardTitle>Invitation history</CardTitle><CardDescription>Review invitations and revoke links that should no longer be used.</CardDescription></CardHeader><CardContent>{invitations.length === 0 ? <p>No invitations recorded.</p> : <ul className="flex flex-col gap-3">{invitations.map(i => <li key={i.id} className="flex flex-wrap items-center gap-2"><span>{i.memberName} · {i.memberNumber} · {i.email}</span><Badge variant="secondary">{i.status}</Badge><span>expires {formatInvitationExpiry(i.expiresAt)}</span>{(i.status === 'pending' || i.status === 'expired' || i.status === 'review required') && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void revoke(i.id)}>Revoke</Button>}</li>)}</ul>}</CardContent></Card>
  </main></div>
}
