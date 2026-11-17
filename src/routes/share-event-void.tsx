import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { usePendingRequest, PendingRequestNotice } from '#/lib/pending-requests/use-pending'
import { listSharesFn } from '#/server/shares/functions'
import { voidShareEventFn } from '#/server/share-event-void/functions'
import { listTradeReconciliationFn } from '#/server/trade-reconciliation/functions'

export const Route = createFileRoute('/share-event-void')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => { try { const [shares, reconciliation] = await Promise.all([listSharesFn(), listTradeReconciliationFn()]); return { shares, reconciliation } } catch { return null } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: ShareEventVoid,
})

type Request = { idempotencyKey: string; eventId: string; reason: string }

function ShareEventVoid() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'share-event-void')
  const [eventId, setEventId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const shares = data?.shares
  const events = shares?.events ?? []
  const activeReconciliation = data?.reconciliation.links.find(l => !l.revokedAt && (l.sellerEvents.some(e => e.id === eventId) || l.buyerEvents.some(e => e.id === eventId)))
  function description(id: string) {
    const event = events.find(item => item.id === id)
    if (!event) return `Event ${id} (details unavailable)`
    const holding = event.jointHoldingId ? shares?.holdings.find(h => h.id === event.jointHoldingId) : undefined
    const holder = event.jointHoldingId ? `Joint holding ${event.holderName || event.jointHoldingId}${holding?.members ? ` (${holding.members})` : ''}` : `Member ${event.holderName || event.memberId || 'unknown'}`
    return `${holder} · ${event.eventDate} · ${event.eventType} · ${event.shares.toLocaleString('en-US')} shares · event ${event.id} · reference: ${event.reference || 'not recorded'} · notes: ${event.notes || 'none'}`
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    const event = events.find(item => item.id === eventId)
    if (activeReconciliation) { setError('Revoke the active trade reconciliation before voiding this event.'); return }
    if (!event || event.voidedAt || !reason.trim()) { setError('Select a recorded event and enter a reason.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), eventId, reason: reason.trim() })
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(request, v => voidShareEventFn({ data: { eventId: v.eventId, reason: v.reason, requestKey: v.idempotencyKey } }), isNew)
      setReview(null); setEventId(''); setReason(''); setMessage('Share event marked void. Its audit history remains in the register.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setError('The void was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The void could not be confirmed. Check the register and reconciliation history, then retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function discard() { try { pending.discard(); setDiscardReview(false) } catch { setError('Could not discard the pending request.') } }
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/shares" className="quiet">Back to shares</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Void an erroneous share event</h1>
    <p>Mark an incorrect individual or joint share event as void while retaining its audit history. This action cannot be undone. It does not execute a transfer, recalculate ownership or change separately reported holdings. Revoke an active <Link to="/trade-reconciliation">trade reconciliation</Link> before voiding a linked event.</p>
    {!data ? <Alert variant="destructive" role="alert"><AlertDescription>The share register is unavailable or access could not be confirmed.</AlertDescription></Alert> : <>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Share event void" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <section className="record-panel" aria-label="Confirm discarding request"><p>The request may already have been recorded. Check the void history before discarding it.</p><Button type="button" disabled={busy} onClick={discard}>Discard request</Button>{' '}<Button type="button" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</Button></section>}
      <nav className="my-5 flex flex-wrap gap-2" aria-label="Page sections"><Button asChild variant="outline"><a href="#share-void-review">Review an event</a></Button><Button asChild variant="outline"><a href="#share-void-history">Voided events</a></Button></nav>
      <section id="share-void-review" className="record-panel"><h2>Review an event</h2>{review ? <div role="region" aria-label="Confirm share event void"><p><strong>{description(review.eventId)}</strong></p><p>Reason: {review.reason}</p><p>Confirm this event is erroneous. This cannot be undone.</p><Button type="button" disabled={locked} onClick={() => void send(review, true)}>{busy ? <SpinnerLabel>Confirm void</SpinnerLabel> : 'Confirm void'}</Button>{' '}<Button type="button" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div> : <form onSubmit={prepare} style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        <label>Event <NativeSelect required value={eventId} disabled={locked} onChange={e => setEventId(e.target.value)}><NativeSelectOption value="">Select a recorded share event</NativeSelectOption>{events.filter(e => !e.voidedAt).map(e => <NativeSelectOption key={e.id} value={e.id}>{description(e.id)}</NativeSelectOption>)}</NativeSelect></label>
        {activeReconciliation && <Alert variant="destructive" role="alert"><AlertDescription>This event is linked to a trade. <Link to="/trade-reconciliation">Revoke the active reconciliation</Link> before voiding it, then reload this page.</AlertDescription></Alert>}
        <label>Reason <Textarea required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></label><Button disabled={locked || !eventId || !!activeReconciliation}>Review void</Button>
      </form>}</section>
      <section id="share-void-history" className="record-panel"><h2>Voided events</h2>{!events.some(e => e.voidedAt) ? <p>No share events have been voided.</p> : <ul>{events.filter(e => e.voidedAt).map(e => <li key={e.id}>{description(e.id)} · voided {e.voidedAt} UTC · {e.voidReason}</li>)}</ul>}</section>
    </>}
  </main></div>
}
