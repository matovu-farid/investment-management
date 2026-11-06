import { DatePickerInput } from '#/components/ui/date-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listInvestmentStatusesFn, changeInvestmentStatusFn } from '#/server/investment-status/functions'

export const Route = createFileRoute('/investment-status')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => listInvestmentStatusesFn().catch(() => null),
  component: InvestmentStatus,
})

type Status = 'active' | 'closed'
type Request = { investmentId: string; expectedStatus: Status; expectedLastEffectiveDate: string | null; expectedLastEventId: string | null; newStatus: Status; effectiveDate: string; source: string; reason: string; idempotencyKey: string }

function InvestmentStatus() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'investment-status-change')
  const [selectedId, setSelectedId] = useState(''), [status, setStatus] = useState<Status>('closed'), [effectiveDate, setEffectiveDate] = useState(''), [source, setSource] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const selected = data?.investments.find(i => i.id === selectedId)
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  function choose(id: string) {
    const investment = data?.investments.find(i => i.id === id)
    setSelectedId(id); setStatus(investment?.status === 'closed' ? 'active' : 'closed'); setEffectiveDate(''); setSource(''); setReason(''); setError(''); setMessage(''); setReview(null)
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!selected || status === selected.status || !effectiveDate || !source.trim() || !reason.trim()) { setError('Select an investment, a different status, date, source and reason.'); return }
    setReview({ investmentId: selected.id, expectedStatus: selected.status, expectedLastEffectiveDate: selected.lastEffectiveDate, expectedLastEventId: selected.lastEventId, newStatus: status, effectiveDate, source: source.trim(), reason: reason.trim(), idempotencyKey: crypto.randomUUID() })
  }
  async function send(request: Request, isNew: boolean) {
    setError(''); setMessage(''); setBusy(true)
    try {
      await pending.send(request, p => changeInvestmentStatusFn({ data: { investmentId: p.investmentId, expectedStatus: p.expectedStatus, expectedLastEffectiveDate: p.expectedLastEffectiveDate, expectedLastEventId: p.expectedLastEventId, newStatus: p.newStatus, effectiveDate: p.effectiveDate, source: p.source, reason: p.reason, requestKey: p.idempotencyKey } }), isNew)
      setReview(null); setSelectedId(''); setEffectiveDate(''); setSource(''); setReason(''); setMessage('Investment status change recorded.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setError('The change was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The change could not be confirmed. If the investment changed since review, check the history and discard the retained request before reviewing again; otherwise retry it unchanged.') }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/investments" className="quiet">Back to investments</Link></header><main className="dashboard flex flex-col gap-6">
    <div><p className="eyebrow">ADMINISTRATION</p><h1>Change investment status</h1><p>Record whether an investment is active or closed, with an effective date and source. The current recorded status is not a historical as-of calculation. Dates cannot be in the future (UTC) or precede the latest status event.</p></div>
    <Alert><AlertDescription>This does not record a disposal, cash movement or accounting entry. Existing valuations, transactions and published snapshots remain unchanged.</AlertDescription></Alert>
    {!data ? <Alert variant="destructive" role="alert"><AlertDescription>Investment statuses are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <PendingRequestNotice title="Investment status change" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <Card aria-label="Confirm discarding request"><CardHeader><CardTitle>Discard pending request?</CardTitle><CardDescription>The request may already have been recorded. Check the change history before discarding it.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={() => { try { pending.discard(); setDiscardReview(false) } catch { setError('The pending request could not be discarded.') } }}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</Button></CardContent></Card>}
      <Card><CardHeader><CardTitle>Review a status change</CardTitle><CardDescription>Select an investment and record the source of the change.</CardDescription></CardHeader><CardContent>{review && selected ? <div aria-label="Confirm investment status change" className="flex flex-col gap-3"><p><strong>{selected.name}</strong> · {selected.assetClass} · {selected.currency}</p><p>Current recorded status: {review.expectedStatus} → new status: {review.newStatus}</p><p>Effective date: {review.effectiveDate} · source: {review.source}</p><p>Reason: {review.reason}</p><p>Confirm this status change is supported by the source. No disposal, valuation or accounting entry will be created.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void send(review, true)}>{busy ? 'Saving…' : 'Confirm status change'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div></div> : <form onSubmit={prepare} className="max-w-2xl"><FieldGroup><Field><FieldLabel htmlFor="status-investment">Investment</FieldLabel><NativeSelect id="status-investment" required value={selectedId} disabled={locked} onChange={e => choose(e.target.value)}><NativeSelectOption value="">Select an investment</NativeSelectOption>{data.investments.map(i => <NativeSelectOption key={i.id} value={i.id}>{i.name} · {i.assetClass} · {i.currency} · {i.status}</NativeSelectOption>)}</NativeSelect></Field>{selected && <><p>Current recorded status: <Badge variant="secondary">{selected.status}</Badge>{selected.lastEffectiveDate ? ` · last change effective ${selected.lastEffectiveDate}` : ' · no status change recorded'}</p><Field><FieldLabel htmlFor="status-new">New status</FieldLabel><NativeSelect id="status-new" value={status} disabled={locked} onChange={e => setStatus(e.target.value as Status)}><NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="closed">Closed</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="status-date">Effective date</FieldLabel><DatePickerInput id="status-date" type="date" required min={selected.lastEffectiveDate ?? undefined} value={effectiveDate} disabled={locked} onChange={e => setEffectiveDate(e.target.value)} /></Field><Field><FieldLabel htmlFor="status-source">Source</FieldLabel><Textarea id="status-source" required maxLength={450} value={source} disabled={locked} onChange={e => setSource(e.target.value)} /></Field><Field><FieldLabel htmlFor="status-reason">Reason</FieldLabel><Textarea id="status-reason" required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></Field></>}<Button disabled={locked || !selected}>Review change</Button></FieldGroup></form>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Status change history</CardTitle><CardDescription>Recorded changes and their supporting sources.</CardDescription></CardHeader><CardContent>{!data.history.length ? <p>No status changes recorded.</p> : <Table><TableHeader><TableRow><TableHead>Investment</TableHead><TableHead>Status change</TableHead><TableHead>Effective date</TableHead><TableHead>Source and reason</TableHead><TableHead>Recorded</TableHead></TableRow></TableHeader><TableBody>{data.history.map(h => <TableRow key={h.id}><TableCell>{h.name}</TableCell><TableCell>{h.oldStatus} → {h.newStatus}</TableCell><TableCell>{h.effectiveDate}</TableCell><TableCell>{h.source}<br />{h.reason}</TableCell><TableCell>{h.createdAt} UTC</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    </>}
  </main></div>
}
