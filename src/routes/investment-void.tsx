import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { usePendingRequest, PendingRequestNotice } from '#/lib/pending-requests/use-pending'
import { listInvestmentsFn } from '#/server/investments/functions'
import { voidInvestmentSourceFn } from '#/server/investment-void/functions'

export const Route = createFileRoute('/investment-void')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => { try { return await listInvestmentsFn() } catch { return null } },
  component: InvestmentVoid,
})

type Kind = 'valuation' | 'transaction'
type Request = { idempotencyKey: string; sourceKind: Kind; sourceId: string; reason: string }
const panel = { background: 'white', border: '1px solid #e2e9e2', borderRadius: 7, padding: 24, marginTop: 24 }

function InvestmentVoid() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'investment-source-void')
  const [kind, setKind] = useState<Kind>('valuation'), [sourceId, setSourceId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const valuations = data?.flatMap(i => i.valuations.map(v => ({ investment: i, item: v }))) ?? []
  const transactions = data?.flatMap(i => i.transactions.map(v => ({ investment: i, item: v }))) ?? []
  function description(k: Kind, id: string) {
    if (k === 'valuation') {
      const row = valuations.find(v => v.item.id === id)
      return row ? `${row.investment.name} · valuation ${row.item.id} · ${row.item.valuationDate} · ${row.item.currency} ${row.item.amountMinor.toLocaleString('en-US')} minor units · basis: ${row.item.basis} · source: ${row.item.source || 'not recorded'}` : `Valuation ${id} (details unavailable)`
    }
    const row = transactions.find(v => v.item.id === id)
    return row ? `${row.investment.name} · transaction ${row.item.id} · ${row.item.transactionDate} · ${row.investment.currency} ${row.item.amountMinor.toLocaleString('en-US')} minor units · type: ${row.item.transactionType} · reference: ${row.item.reference || 'not recorded'} · notes: ${row.item.notes || 'none'}` : `Transaction ${id} (details unavailable)`
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    const source = kind === 'valuation' ? valuations.find(v => v.item.id === sourceId)?.item : transactions.find(v => v.item.id === sourceId)?.item
    if (!source || source.voidedAt || !reason.trim()) { setError('Select a recorded item and enter a reason.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), sourceKind: kind, sourceId, reason: reason.trim() })
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(request, v => voidInvestmentSourceFn({ data: { sourceKind: v.sourceKind, sourceId: v.sourceId, reason: v.reason, requestKey: v.idempotencyKey } }), isNew)
      setReview(null); setSourceId(''); setReason(''); setMessage('Record marked void. Its audit history remains in the register.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setError('The void was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The void could not be confirmed. Check the record and publication status, then retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function discard() { try { pending.discard(); setDiscardReview(false) } catch { setError('Could not discard the pending request.') } }
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/investments" className="quiet">Back to investments</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Void an erroneous investment record</h1>
    <p>Mark an incorrect valuation or transaction as void while retaining its audit history. This action cannot be undone and does not reverse an accounting entry or settlement.</p>
    <p>Withdraw any active member publication of a valuation before voiding it. The system checks the publication status when you confirm.</p>
    {!data ? <p role="alert">The investment register is unavailable or access could not be confirmed.</p> : <>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Investment record void" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <section style={panel} aria-label="Confirm discarding request"><p>The request may already have been recorded. Check the void history before discarding it.</p><button type="button" disabled={busy} onClick={discard}>Discard request</button>{' '}<button type="button" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</button></section>}
      <section style={panel}><h2>Review a record</h2>{review ? <div role="region" aria-label="Confirm investment record void"><p><strong>{description(review.sourceKind, review.sourceId)}</strong></p><p>Reason: {review.reason}</p><p>Confirm this record is erroneous. This cannot be undone.</p><button type="button" disabled={locked} onClick={() => void send(review, true)}>{busy ? 'Saving…' : 'Confirm void'}</button>{' '}<button type="button" disabled={busy} onClick={() => setReview(null)}>Edit</button></div> : <form onSubmit={prepare} style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        <label>Record type <select value={kind} disabled={locked} onChange={e => { setKind(e.target.value as Kind); setSourceId('') }}><option value="valuation">Valuation</option><option value="transaction">Transaction</option></select></label>
        <label>Record <select required value={sourceId} disabled={locked} onChange={e => setSourceId(e.target.value)}><option value="">Select a recorded {kind}</option>{kind === 'valuation' ? valuations.filter(v => !v.item.voidedAt).map(v => <option key={v.item.id} value={v.item.id}>{description('valuation', v.item.id)}</option>) : transactions.filter(v => !v.item.voidedAt).map(v => <option key={v.item.id} value={v.item.id}>{description('transaction', v.item.id)}</option>)}</select></label>
        <label>Reason <textarea required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></label><button disabled={locked || !sourceId}>Review void</button>
      </form>}</section>
      <section style={panel}><h2>Voided records</h2>{!valuations.some(v => v.item.voidedAt) && !transactions.some(v => v.item.voidedAt) ? <p>No investment records have been voided.</p> : <ul>{valuations.filter(v => v.item.voidedAt).map(v => <li key={v.item.id}>Valuation · {description('valuation', v.item.id)} · voided {v.item.voidedAt} UTC · {v.item.voidReason}</li>)}{transactions.filter(v => v.item.voidedAt).map(v => <li key={v.item.id}>Transaction · {description('transaction', v.item.id)} · voided {v.item.voidedAt} UTC · {v.item.voidReason}</li>)}</ul>}</section>
    </>}
  </main></div>
}
