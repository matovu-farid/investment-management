import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listTradeVoidOptionsFn, voidTradeFn } from '#/server/trade-void/functions'
import { listTradeReconciliationFn } from '#/server/trade-reconciliation/functions'

export const Route = createFileRoute('/trade-void')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => { try { const [trades, reconciliation] = await Promise.all([listTradeVoidOptionsFn(), listTradeReconciliationFn()]); return { trades, reconciliation } } catch { return null } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: TradeVoid,
})

type Request = { tradeId: string; reason: string; idempotencyKey: string }

function TradeVoid() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'share-trade-void')
  const [tradeId, setTradeId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const trades = data?.trades.trades ?? [], selected = trades.find(t => t.id === tradeId)
  const activeReconciliation = data?.reconciliation.links.find(l => l.tradeId === tradeId && !l.revokedAt)
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  function description(id: string) {
    const trade = trades.find(t => t.id === id)
    if (!trade) return `Trade ${id} (details unavailable)`
    return `${trade.tradeDate} · ${trade.sellerName} to ${trade.buyerType === 'group' ? 'Group' : trade.buyerName || 'unknown member'} · ${trade.shares.toLocaleString('en-US')} shares · ${trade.currency} ${trade.priceMinor.toLocaleString('en-US')} per share · recorded consideration ${trade.currency} ${trade.considerationMinor.toLocaleString('en-US')} minor units · request ${trade.saleId} · trade ${trade.id} · reference: ${trade.reference || 'not recorded'} · notes: ${trade.notes || 'none'}`
  }
  function prepare(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!selected || selected.voidedAt || !reason.trim()) { setError('Select a recorded trade and enter a reason.'); return }
    if (activeReconciliation) { setError('Revoke the active reconciliation before voiding this trade.'); return }
    if (selected.activePublicationId) { setError('Withdraw the active trade publication before voiding this trade.'); return }
    setReview({ tradeId: selected.id, reason: reason.trim(), idempotencyKey: crypto.randomUUID() })
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(request, v => voidTradeFn({ data: { tradeId: v.tradeId, reason: v.reason, requestKey: v.idempotencyKey } }), isNew)
      setReview(null); setTradeId(''); setReason(''); setMessage('Trade marked void. Its audit history remains in the register.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setError('The void was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The void could not be confirmed. Check the trade, publication and reconciliation history, then retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function discard() { try { pending.discard(); setDiscardReview(false) } catch { setError('Could not discard the pending request.') } }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/share-trades" className="quiet">Back to recorded trades</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Void an incorrect trade</h1>
    <p>Mark an erroneous trade fact as void while retaining its audit history. This does not transfer shares, reverse payment or change ownership.</p>
    <p>Withdraw an active member publication and revoke any active reconciliation before voiding its trade. Previously saved board drafts remain unchanged.</p>
    {!data ? <Alert variant="destructive" role="alert"><AlertDescription>The trade register is unavailable or access could not be confirmed.</AlertDescription></Alert> : <>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Trade void" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <section className="record-panel" aria-label="Confirm discarding request"><p>The request may already have been recorded. Check the void history before discarding it.</p><Button type="button" disabled={busy} onClick={discard}>Discard request</Button>{' '}<Button type="button" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</Button></section>}
      <section className="record-panel"><h2>Review a trade</h2>{review ? <div role="region" aria-label="Confirm trade void"><p><strong>{description(review.tradeId)}</strong></p><p>Reason: {review.reason}</p><p>Confirm this recorded trade is erroneous. This cannot be undone.</p><Button type="button" disabled={locked} onClick={() => void send(review, true)}>{busy ? <SpinnerLabel>Confirm void</SpinnerLabel> : 'Confirm void'}</Button>{' '}<Button type="button" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div> : <form onSubmit={prepare} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <label>Trade <NativeSelect required value={tradeId} disabled={locked} onChange={e => setTradeId(e.target.value)}><NativeSelectOption value="">Select a recorded trade</NativeSelectOption>{trades.filter(t => !t.voidedAt).map(t => <NativeSelectOption key={t.id} value={t.id}>{description(t.id)}</NativeSelectOption>)}</NativeSelect></label>
        {activeReconciliation && <Alert variant="destructive" role="alert"><AlertDescription>This trade is linked to share events. <Link to="/trade-reconciliation">Revoke the active reconciliation</Link> before voiding it, then reload this page.</AlertDescription></Alert>}
        {selected?.activePublicationId && <Alert variant="destructive" role="alert"><AlertDescription>This trade is currently published. <Link to="/trade-publications">Withdraw its publication</Link> before voiding it, then reload this page.</AlertDescription></Alert>}
        <label>Reason <Textarea required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></label><Button disabled={locked || !selected || !!selected.activePublicationId || !!activeReconciliation}>Review void</Button>
      </form>}</section>
      <section className="record-panel"><h2>Voided trades</h2>{!trades.some(t => t.voidedAt) ? <p>No trades have been voided.</p> : <ul>{trades.filter(t => t.voidedAt).map(t => <li key={t.id}>{description(t.id)} · voided {t.voidedAt} UTC · {t.voidReason}</li>)}</ul>}</section>
    </>}
  </main></div>
}
