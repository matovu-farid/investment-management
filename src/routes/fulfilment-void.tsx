import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { usePendingRequest, PendingRequestNotice } from '#/lib/pending-requests/use-pending'
import { listLendingFn } from '#/server/lending/functions'
import { voidFulfilmentFn } from '#/server/fulfilment-void/functions'

export const Route = createFileRoute('/fulfilment-void')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => { try { return await listLendingFn() } catch { return null } },
  component: FulfilmentVoid,
})

type Request = { idempotencyKey: string; fulfilmentId: string; reason: string }
const panel = { background: 'white', border: '1px solid #e2e9e2', borderRadius: 7, padding: 24, marginTop: 24 }
function FulfilmentVoid() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'fulfilment-void')
  const [fulfilmentId, setFulfilmentId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  function description(id: string) {
    const f = data?.fulfilments.find(item => item.id === id)
    const b = data?.bookings.find(item => item.id === f?.bookingId)
    return `${b?.memberName ?? 'Unknown member'} · ${b?.currency ?? ''} ${f?.amountMinor.toLocaleString('en-US') ?? '—'} minor units · fulfilled ${f?.fulfilmentDate ?? '—'} · booking ${f?.bookingId ?? '—'} · booking source ${f?.bookingSourceRef || 'not recorded'} · fulfilment ${id} · fulfilment source ${f?.sourceRef || 'not recorded'}`
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    const fulfilment = data?.fulfilments.find(f => f.id === fulfilmentId)
    if (!fulfilment || fulfilment.voidedAt || !reason.trim()) { setError('Select a recorded fulfilment and enter a reason.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), fulfilmentId, reason: reason.trim() })
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(request, v => voidFulfilmentFn({ data: { fulfilmentId: v.fulfilmentId, reason: v.reason, requestKey: v.idempotencyKey } }), isNew)
      setReview(null); setFulfilmentId(''); setReason(''); setMessage('Fulfilment marked void. Its history remains in the register.')
      try { await router.invalidate() } catch { setError('The void was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The void could not be confirmed. Check the register and retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function discard() { try { pending.discard(); setDiscardReview(false) } catch { setError('Could not discard the pending request.') } }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Void an erroneous booking fulfilment</h1>
    <p>Mark an incorrect fulfilment as void while retaining its audit history. This action cannot be undone. It updates recorded fulfilled and remaining amounts; it does not reverse a loan or accounting entry.</p>
    {!data ? <p role="alert">The lending register is unavailable or access could not be confirmed.</p> : <>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Fulfilment void" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <section style={panel} aria-label="Confirm discarding request"><p>The request may already have been recorded. Check the void history before discarding it.</p><button type="button" disabled={busy} onClick={discard}>Discard request</button>{' '}<button type="button" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</button></section>}
      <section style={panel}><h2>Review a fulfilment</h2>{review ? <div role="region" aria-label="Confirm fulfilment void"><p><strong>{description(review.fulfilmentId)}</strong></p><p>Reason: {review.reason}</p><p>Confirm this fulfilment is erroneous. This cannot be undone.</p><button type="button" disabled={busy || !pending.ready || !!pending.pending || !!pending.storageError} onClick={() => void send(review, true)}>{busy ? 'Saving…' : 'Confirm void'}</button>{' '}<button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button></div> : <form onSubmit={prepare} style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        <label>Fulfilment <select required value={fulfilmentId} onChange={e => setFulfilmentId(e.target.value)}><option value="">Select a recorded fulfilment</option>{data.fulfilments.filter(f => !f.voidedAt).map(f => <option key={f.id} value={f.id}>{description(f.id)}</option>)}</select></label>
        <label>Reason <textarea required maxLength={450} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || !fulfilmentId || !pending.ready || !!pending.pending || !!pending.storageError}>Review void</button>
      </form>}</section>
      <section style={panel}><h2>Voided fulfilments</h2>{!data.fulfilments.some(f => f.voidedAt) ? <p>No fulfilments have been voided.</p> : <ul>{data.fulfilments.filter(f => f.voidedAt).map(f => <li key={f.id}>{description(f.id)} · voided {f.voidedAt} · {f.voidReason}</li>)}</ul>}</section>
    </>}
  </main></div>
}
