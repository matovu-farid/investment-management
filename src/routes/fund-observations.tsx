import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Badge } from '#/components/ui/badge'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listFundObservationsFn, recordFundObservationFn, voidFundObservationFn } from '#/server/fund-observations/functions'

export const Route = createFileRoute('/fund-observations')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => listFundObservationsFn().catch(() => null),
  component: FundObservations,
})

type RecordRequest = { idempotencyKey: string; observedDate: string; amountMinor: string; currency: string; basis: string; source: string }
type VoidRequest = { idempotencyKey: string; observationId: string; reason: string }
const amount = (value: string) => BigInt(value).toLocaleString('en-US')

function FundObservations() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const recording = usePendingRequest<RecordRequest>(userId, 'fund-observation')
  const voiding = usePendingRequest<VoidRequest>(userId, 'fund-observation-void')
  const [observedDate, setObservedDate] = useState(''), [amountMinor, setAmountMinor] = useState(''), [currency, setCurrency] = useState('UGX'), [basis, setBasis] = useState(''), [source, setSource] = useState('')
  const [reason, setReason] = useState(''), [voidId, setVoidId] = useState('')
  const [review, setReview] = useState<RecordRequest | null>(null), [voidReview, setVoidReview] = useState<VoidRequest | null>(null)
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const locked = busy || refreshFailed || !recording.ready || !voiding.ready || !!recording.pending || !!voiding.pending || !!recording.storageError || !!voiding.storageError
  const selectedVoid = data?.observations.find(o => o.id === voidId)
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the register could not refresh. Reload before making another change.') } }
  function discard(action: () => void) { if (window.confirm('This request may already have been recorded. Check the register before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!observedDate || !/^(0|[1-9][0-9]{0,29})$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency) || !basis.trim() || !source.trim()) { setError('Complete every field with a non-negative whole amount and a three-letter currency.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), observedDate, amountMinor, currency, basis: basis.trim(), source: source.trim() })
  }
  async function record(v: RecordRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { let active = false; await recording.send(v, async p => { const { idempotencyKey, ...details } = p; const result = await recordFundObservationFn({ data: { ...details, requestKey: idempotencyKey } }); active = result.active }, isNew); setReview(null); setObservedDate(''); setAmountMinor(''); setCurrency('UGX'); setBasis(''); setSource(''); setMessage(active ? 'Observation recorded.' : 'The original observation was recorded earlier and is now void.'); await refresh() }
    catch { setError('The observation could not be confirmed. Check the date and register, then retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function prepareVoid(e: React.FormEvent) { e.preventDefault(); setError(''); setMessage(''); if (!selectedVoid || selectedVoid.voidedAt || !reason.trim()) { setError('Select a current observation and enter a reason.'); return }; setVoidReview({ idempotencyKey: crypto.randomUUID(), observationId: selectedVoid.id, reason: reason.trim() }) }
  async function voidRecord(v: VoidRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await voiding.send(v, p => voidFundObservationFn({ data: { observationId: p.observationId, reason: p.reason, requestKey: p.idempotencyKey } }), isNew); setVoidReview(null); setVoidId(''); setReason(''); setMessage('Observation marked void. Its history remains in the register.'); await refresh() }
    catch { setError('The void could not be confirmed. Check the register and retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function label(o: NonNullable<typeof data>['observations'][number]) { return `${o.observedDate} · ${o.currency} ${amount(o.amountMinor)} minor units · ${o.basis} · ${o.id}` }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard flex flex-col gap-6">
    <div><p className="eyebrow">ADMINISTRATION</p><h1>Reported fund availability</h1><p>Record a dated amount reported by a source for the Kanungu fund.</p></div>
    <Alert><AlertDescription>This app does not calculate or verify available cash or lending capacity. An observation is not an approval or a lending decision, and does not post to the ledger. Observations remain administrator-only.</AlertDescription></Alert>
    {!data ? <Alert variant="destructive" role="alert"><AlertDescription>The register is unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <PendingRequestNotice title="Fund observation" pending={recording.pending} storageError={recording.storageError} disabled={busy || refreshFailed} onRetry={() => recording.pending && void record(recording.pending, false)} onDiscard={() => discard(recording.discard)} />
      <PendingRequestNotice title="Observation void" pending={voiding.pending} storageError={voiding.storageError} disabled={busy || refreshFailed} onRetry={() => voiding.pending && void voidRecord(voiding.pending, false)} onDiscard={() => discard(voiding.discard)} />
      <Card><CardHeader><CardTitle>Record an observation</CardTitle><CardDescription>The observation date cannot be later than today in Kampala.</CardDescription></CardHeader><CardContent>
        {review ? <div aria-label="Review observation" className="flex flex-col gap-3"><h3>Review the observation</h3><p>As of {review.observedDate} · {review.currency} {amount(review.amountMinor)} minor units</p><p>Basis: {review.basis}</p><p>Source: {review.source}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void record(review, true)}>{busy ? 'Saving…' : 'Confirm observation'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div></div> :
        <form onSubmit={prepare} className="max-w-2xl"><FieldGroup>
          <Field><FieldLabel htmlFor="fund-date">As-of date</FieldLabel><DatePickerInput id="fund-date" required type="date" value={observedDate} disabled={locked} onChange={e => setObservedDate(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="fund-amount">Reported amount (integer minor units)</FieldLabel><Input id="fund-amount" required inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={30} value={amountMinor} disabled={locked} onChange={e => setAmountMinor(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="fund-currency">Currency (three-letter code)</FieldLabel><Input id="fund-currency" required pattern="[A-Z]{3}" maxLength={3} value={currency} disabled={locked} onChange={e => setCurrency(e.target.value.toUpperCase())} /></Field>
          <Field><FieldLabel htmlFor="fund-basis">Basis</FieldLabel><Textarea id="fund-basis" required maxLength={450} value={basis} disabled={locked} onChange={e => setBasis(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="fund-source">Source</FieldLabel><Textarea id="fund-source" required maxLength={450} value={source} disabled={locked} onChange={e => setSource(e.target.value)} /></Field>
          <Button disabled={locked}>Review observation</Button>
        </FieldGroup></form>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Recorded observations</CardTitle><CardDescription>Recorded source details and void history.</CardDescription></CardHeader><CardContent>{data.observations.length === 0 ? <p>No observations recorded.</p> : <Table><TableHeader><TableRow><TableHead>As of</TableHead><TableHead>Amount (minor units)</TableHead><TableHead>Basis and source</TableHead><TableHead>Recorded</TableHead><TableHead>Status and history</TableHead></TableRow></TableHeader><TableBody>{data.observations.map(o => <TableRow key={o.id}><TableCell>{o.observedDate}</TableCell><TableCell>{o.currency} {amount(o.amountMinor)}</TableCell><TableCell>{o.basis}<br />Source: {o.source}</TableCell><TableCell>{o.createdAt} UTC<br />ID {o.id}</TableCell><TableCell>{o.voidedAt ? <><Badge variant="destructive">Void</Badge><br />{o.voidedAt} UTC · {o.voidReason}</> : <Badge variant="secondary">Recorded</Badge>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Void an erroneous observation</CardTitle><CardDescription>Voiding preserves the source and audit history and cannot be undone. It does not reverse an accounting entry.</CardDescription></CardHeader><CardContent>
        {voidReview ? <div aria-label="Review void" className="flex flex-col gap-3"><h3>Review the void</h3><p>{selectedVoid ? label(selectedVoid) : voidReview.observationId}</p><p>Reason: {voidReview.reason}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={locked} onClick={() => void voidRecord(voidReview, true)}>{busy ? 'Saving…' : 'Confirm void'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setVoidReview(null)}>Edit</Button></div></div> :
        <form onSubmit={prepareVoid} className="max-w-2xl"><FieldGroup><Field><FieldLabel htmlFor="fund-void-id">Observation</FieldLabel><NativeSelect id="fund-void-id" required value={voidId} disabled={locked} onChange={e => setVoidId(e.target.value)}><NativeSelectOption value="">Select an observation</NativeSelectOption>{data.observations.filter(o => !o.voidedAt).map(o => <NativeSelectOption key={o.id} value={o.id}>{label(o)}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="fund-void-reason">Reason</FieldLabel><Textarea id="fund-void-reason" required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></Field><Button disabled={locked || !voidId}>Review void</Button></FieldGroup></form>}
      </CardContent></Card>
    </>}
  </main></div>
}
