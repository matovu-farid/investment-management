import { Alert, AlertDescription } from '#/components/ui/alert'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listMemberChangesFn, changeMemberFn } from '#/server/member-changes/functions'

export const Route = createFileRoute('/member-changes')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => listMemberChangesFn().catch(() => null),
  component: MemberChanges,
})

type Data = NonNullable<Awaited<ReturnType<typeof listMemberChangesFn>>>
type Member = Data['members'][number]
type Values = { memberNumber: string; fullName: string; email: string | null; status: 'active' | 'inactive' }
type Request = { memberId: string; expected: Values & { activeLinkId: string | null; pendingInvitationIds: string[] }; next: Values; reason: string; idempotencyKey: string }
const panel = { background: 'white', border: '1px solid #e2e9e2', borderRadius: 7, padding: 24, marginTop: 24 }
function summary(member: Member) { return `${member.memberNumber} · ${member.fullName} · ${member.status}` }

function MemberChanges() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'member-change')
  const [selectedId, setSelectedId] = useState(''), [number, setNumber] = useState(''), [name, setName] = useState(''), [email, setEmail] = useState(''), [status, setStatus] = useState<'active' | 'inactive'>('active'), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const selected = data?.members.find(m => m.id === selectedId)
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  function choose(id: string) {
    const member = data?.members.find(m => m.id === id)
    setSelectedId(id); setNumber(member?.memberNumber ?? ''); setName(member?.fullName ?? ''); setEmail(member?.email ?? ''); setStatus(member?.status ?? 'active'); setReason(''); setError(''); setMessage(''); setReview(null)
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!selected || !number.trim() || !name.trim() || !reason.trim()) { setError('Select a member and enter the required details and reason.'); return }
    const next: Values = { memberNumber: number.trim(), fullName: name.trim(), email: email.trim() || null, status }
    if (next.memberNumber === selected.memberNumber && next.fullName === selected.fullName && next.email === selected.email && next.status === selected.status) { setError('Change at least one detail or the status before continuing.'); return }
    setReview({ memberId: selected.id, expected: { memberNumber: selected.memberNumber, fullName: selected.fullName, email: selected.email, status: selected.status, activeLinkId: selected.activeLink?.id ?? null, pendingInvitationIds: selected.pendingInvitations.map(i => i.id).sort() }, next, reason: reason.trim(), idempotencyKey: crypto.randomUUID() })
  }
  async function send(request: Request, isNew: boolean) {
    setError(''); setMessage(''); setBusy(true)
    try {
      await pending.send(request, p => changeMemberFn({ data: { memberId: p.memberId, expected: p.expected, next: p.next, reason: p.reason, requestKey: p.idempotencyKey } }), isNew)
      setReview(null); setSelectedId(''); setNumber(''); setName(''); setEmail(''); setReason(''); setMessage('Member change recorded. Review the updated register before continuing.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setError('The change was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The change could not be confirmed. If the member or access links changed since review, check the register and discard the retained request before reviewing again. Otherwise retry it unchanged.') }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/members" className="quiet">Back to members</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Correct member details or status</h1><p>Review changes and provide a reason. Changing a member record does not change their financial records or establish an ownership or loan outcome.</p>
    <p>Changing a member’s status revokes the member account link and all outstanding invitations shown in the review, including expired invitations. Reactivation does not restore member access: an administrator must link an account or issue an invitation again. Any independent administrator role on an account is not changed. Correcting a member email does not change an account login email or revoke existing invitations.</p>
    {!data ? <Alert variant="destructive" role="alert"><AlertDescription>Member changes are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Member change" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <section style={panel} aria-label="Confirm discarding request"><p>The request may already have been recorded. Check the change history before discarding it.</p><button type="button" disabled={busy} onClick={() => { try { pending.discard(); setDiscardReview(false) } catch { setError('The pending request could not be discarded.') } }}>Discard request</button>{' '}<button type="button" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</button></section>}
      <section style={panel}><h2>Review a member change</h2>{review && selected ? <div aria-label="Confirm member change"><p><strong>{summary(selected)}</strong></p><table><thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{([['Member number', review.expected.memberNumber, review.next.memberNumber], ['Full name', review.expected.fullName, review.next.fullName], ['Email', review.expected.email ?? '—', review.next.email ?? '—'], ['Status', review.expected.status, review.next.status]] as const).map(([label, before, after]) => <tr key={label}><th scope="row">{label}</th><td>{before}</td><td>{after}</td></tr>)}</tbody></table><p>Reason: {review.reason}</p>{review.expected.status !== review.next.status && <><h3>Member access to be revoked</h3>{selected.activeLink ? <p>Linked account: {selected.activeLink.userName} · {selected.activeLink.userEmail}</p> : <p>No linked account.</p>}{selected.pendingInvitations.length ? <ul>{selected.pendingInvitations.map(i => <li key={i.id}>Invitation: {i.email} · expires {i.expiresAt}</li>)}</ul> : <p>No outstanding invitations.</p>}<p>Changing the status will revoke these links and invitations. Reactivation does not restore member access. Any independent administrator role is unchanged.</p></>}<button type="button" disabled={locked} onClick={() => void send(review, true)}>{busy ? 'Saving…' : 'Confirm member change'}</button>{' '}<button type="button" disabled={busy} onClick={() => setReview(null)}>Edit</button></div> : <form onSubmit={prepare} style={{ display: 'grid', gap: 12, maxWidth: 680 }}><label>Member <select required value={selectedId} disabled={locked} onChange={e => choose(e.target.value)}><option value="">Select a member</option>{data.members.map(m => <option key={m.id} value={m.id}>{summary(m)}</option>)}</select></label>{selected && <><label>Member number <input required maxLength={64} value={number} disabled={locked} onChange={e => setNumber(e.target.value)} /></label><label>Full name <input required maxLength={200} value={name} disabled={locked} onChange={e => setName(e.target.value)} /></label><label>Email address (optional) <input type="email" maxLength={254} value={email} disabled={locked} onChange={e => setEmail(e.target.value)} /></label><label>Status <select value={status} disabled={locked} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label>Reason <textarea required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></label></>}<button disabled={locked || !selected}>Review change</button></form>}</section>
      <section style={panel}><h2>Change history</h2>{!data.history.length ? <p>No member changes recorded.</p> : <ul>{data.history.map(h => <li key={h.id}>{h.createdAt} UTC · member {h.memberId} · {h.oldMemberNumber} / {h.oldFullName} / {h.oldEmail ?? '—'} / {h.oldStatus} → {h.newMemberNumber} / {h.newFullName} / {h.newEmail ?? '—'} / {h.newStatus} · {h.reason}</li>)}</ul>}</section>
    </>}
  </main></div>
}
