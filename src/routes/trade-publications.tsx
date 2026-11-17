import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listAdminTradePublicationsFn, publishTradeFn, withdrawTradeFn } from '#/server/trade-publications/functions'

export const Route = createFileRoute('/trade-publications')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => listAdminTradePublicationsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: TradePublications,
})

type Data = NonNullable<Awaited<ReturnType<typeof listAdminTradePublicationsFn>>>
type Trade = Data['options'][number]
type Preview = Pick<Trade, 'tradeDate' | 'shares' | 'priceMinor' | 'considerationMinor' | 'currency'>
type PublishRequest = { tradeId: string; preview: Preview; idempotencyKey: string }
type WithdrawRequest = { publicationId: string; idempotencyKey: string }
const number = (value: string) => BigInt(value).toLocaleString('en-US')
function Facts({ trade }: { trade: Preview }) {
  return <dl><dt>Trade date</dt><dd>{trade.tradeDate}</dd><dt>Shares</dt><dd>{number(trade.shares)}</dd><dt>Price per share</dt><dd>{trade.currency} {number(trade.priceMinor)} minor units</dd><dt>Transaction amount</dt><dd>{trade.currency} {number(trade.considerationMinor)} minor units</dd></dl>
}
function TradePublications() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const [tradeId, setTradeId] = useState(''), [review, setReview] = useState<PublishRequest | null>(null), [withdrawReview, setWithdrawReview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [discardTarget, setDiscardTarget] = useState<'publish'|'withdraw'|null>(null)
  const publishing = usePendingRequest<PublishRequest>(userId, 'trade-publication')
  const withdrawing = usePendingRequest<WithdrawRequest>(userId, 'trade-publication-withdrawal')
  const locked = busy || refreshFailed || !publishing.ready || !withdrawing.ready || !!publishing.pending || !!withdrawing.pending || !!publishing.storageError || !!withdrawing.storageError
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('The change was recorded, but the list could not refresh. Reload before continuing.') } }
  async function publish(request: PublishRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await publishing.send(request, async r => { const result = await publishTradeFn({ data: { tradeId: r.tradeId, preview: r.preview, requestKey: r.idempotencyKey } }); active = result.active }, isNew)
      setReview(null); setTradeId(''); setMessage(active ? 'Trade published to active linked members.' : 'The earlier publication is no longer active.'); await refresh()
    } catch { setError('Publication could not be confirmed. Check history and retry the retained request unchanged. If the trade changed, discard the request after checking history and review it again.') }
    finally { setBusy(false) }
  }
  async function withdraw(request: WithdrawRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await withdrawing.send(request, r => withdrawTradeFn({ data: { publicationId: r.publicationId, requestKey: r.idempotencyKey } }), isNew); setWithdrawReview(null); setMessage('Publication withdrawn from member view.'); await refresh() }
    catch { setError('Withdrawal could not be confirmed. Check history and retry the retained request unchanged.') }
    finally { setBusy(false) }
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); const t = data?.options.find(x => x.tradeId === tradeId); if (!t) return
    setError(''); setMessage(''); setReview({ tradeId: t.tradeId, preview: { tradeDate: t.tradeDate, shares: t.shares, priceMinor: t.priceMinor, considerationMinor: t.considerationMinor, currency: t.currency }, idempotencyKey: crypto.randomUUID() })
  }
  return <div className="app"><header><Link to="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/share-trades" className="quiet">Back to share trades</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Publish share trade history</h1><p>Choose a recorded trade to share with active linked members. The published facts omit buyer and seller names, but dates, quantities and prices can indirectly identify participants in a small group. Review each trade before publishing. Publishing does not establish settlement or change ownership.</p>
  {data === null ? <Alert variant="destructive" role="alert"><AlertDescription>Trade publications are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <p role="status">{message}</p>}
    <PendingRequestNotice title="Trade publication" pending={publishing.pending} storageError={publishing.storageError} disabled={busy || refreshFailed} onRetry={() => publishing.pending && void publish(publishing.pending, false)} onDiscard={() => setDiscardTarget('publish')} />
    <PendingRequestNotice title="Trade withdrawal" pending={withdrawing.pending} storageError={withdrawing.storageError} disabled={busy || refreshFailed} onRetry={() => withdrawing.pending && void withdraw(withdrawing.pending, false)} onDiscard={() => setDiscardTarget('withdraw')} />
    {discardTarget && <section className="record-panel" aria-label="Confirm discarding request"><p>This request may already have been recorded. Check publication history before discarding it.</p><Button type="button" disabled={busy} onClick={() => { try { (discardTarget === 'publish' ? publishing : withdrawing).discard(); setDiscardTarget(null) } catch { setError('The pending request could not be discarded.') } }}>Discard request</Button>{' '}<Button type="button" disabled={busy} onClick={() => setDiscardTarget(null)}>Keep request</Button></section>}
    <nav className="my-5 flex flex-wrap gap-2" aria-label="Page sections"><Button asChild variant="outline"><a href="#trade-publication-review">Review a recorded trade</a></Button><Button asChild variant="outline"><a href="#trade-publication-history">Publication history</a></Button></nav>
      <section id="trade-publication-review" className="record-panel"><h2>Review a recorded trade</h2>{review ? <section aria-label="Review trade publication"><h3>Member-visible facts</h3><Facts trade={review.preview}/><p>Publishing shares these facts with all active linked members. Participant names are omitted, but the facts may still identify them. This is a recorded trade fact, not confirmation of payment or transfer.</p><Button type="button" disabled={locked} onClick={() => void publish(review, true)}>Publish reviewed trade</Button>{' '}<Button type="button" disabled={busy} onClick={() => setReview(null)}>Edit</Button></section> : <form onSubmit={prepare}><label>Recorded trade <NativeSelect required value={tradeId} disabled={locked} onChange={e => setTradeId(e.target.value)}><NativeSelectOption value="">Select a recorded trade</NativeSelectOption>{data.options.map(t => <NativeSelectOption key={t.tradeId} value={t.tradeId}>{t.tradeDate} · {number(t.shares)} shares · {t.currency} {number(t.considerationMinor)} · trade {t.tradeId}</NativeSelectOption>)}</NativeSelect></label>{' '}<Button disabled={locked || !tradeId}>Review trade</Button></form>}{!data.options.length && <p>No unpublished recorded trades are available.</p>}</section>
    <section id="trade-publication-history" className="record-panel"><h2>Publication history</h2>{!data.publications.length ? <p>No trades have been published.</p> : data.publications.map(p => <article key={p.id}><h3>{p.tradeDate} · {number(p.shares)} shares</h3><Facts trade={p}/><p>Published {p.publishedAt} UTC · {p.withdrawnAt ? `withdrawn ${p.withdrawnAt} UTC` : 'visible to active linked members'} · publication {p.id} · source trade {p.tradeId}</p>{!p.withdrawnAt && (withdrawReview === p.id ? <div><p>Withdraw this publication from member view? Copies already saved by members cannot be recalled.</p><Button type="button" disabled={locked} onClick={() => void withdraw({publicationId:p.id,idempotencyKey:crypto.randomUUID()},true)}>Confirm withdrawal</Button>{' '}<Button type="button" disabled={busy} onClick={() => setWithdrawReview(null)}>Cancel</Button></div> : <Button type="button" disabled={locked} onClick={() => setWithdrawReview(p.id)}>Withdraw</Button>)}</article>)}</section>
  </>}</main></div>
}
