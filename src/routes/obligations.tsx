import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listObligationsFn, recordObligationFn, voidObligationFn } from '#/server/obligations/functions'

export const Route = createFileRoute('/obligations')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => listObligationsFn().catch(() => null),
  component: Obligations,
})

type RecordRequest = { idempotencyKey: string; kind: 'borrowing' | 'deposit'; memberId: string | null; creditor: string | null; observedDate: string; amountMinor: string; currency: string; description: string; source: string }
type VoidRequest = { idempotencyKey: string; observationId: string; reason: string }
const amount = (value: string) => BigInt(value).toLocaleString('en-US')
function Obligations() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const recording = usePendingRequest<RecordRequest>(userId, 'obligation-observation')
  const voiding = usePendingRequest<VoidRequest>(userId, 'obligation-void')
  const [kind, setKind] = useState<'borrowing' | 'deposit'>('borrowing')
  const [memberId, setMemberId] = useState(''), [creditor, setCreditor] = useState(''), [observedDate, setObservedDate] = useState(''), [amountMinor, setAmountMinor] = useState(''), [currency, setCurrency] = useState('UGX'), [description, setDescription] = useState(''), [source, setSource] = useState('')
  const [reason, setReason] = useState(''), [voidId, setVoidId] = useState('')
  const [review, setReview] = useState<RecordRequest | null>(null), [voidReview, setVoidReview] = useState<VoidRequest | null>(null)
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const locked = busy || refreshFailed || !recording.ready || !voiding.ready || !!recording.pending || !!voiding.pending || !!recording.storageError || !!voiding.storageError
  const selectedMember = data?.members.find(m => m.id === memberId)
  const selectedVoid = data?.observations.find(o => o.id === voidId)
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the register could not refresh. Reload before making another change.') } }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check the register before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if ((kind === 'deposit' && (!selectedMember || selectedMember.status !== 'active')) || (kind === 'borrowing' && !creditor.trim()) || !observedDate || !/^(0|[1-9][0-9]{0,29})$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency) || !description.trim() || !source.trim()) { setError('Complete the required fields with an active member or creditor and a non-negative whole amount.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), kind, memberId: kind === 'deposit' ? memberId : null, creditor: kind === 'borrowing' ? creditor.trim() : null, observedDate, amountMinor, currency, description: description.trim(), source: source.trim() })
  }
  async function record(v: RecordRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { let active = false; await recording.send(v, async p => { const { idempotencyKey, ...details } = p; const result = await recordObligationFn({ data: { ...details, requestKey: idempotencyKey } }); active = result.active }, isNew); setReview(null); setMemberId(''); setCreditor(''); setObservedDate(''); setAmountMinor(''); setCurrency('UGX'); setDescription(''); setSource(''); setMessage(active ? 'Observation recorded.' : 'The original observation was recorded earlier and is now void.'); await refresh() }
    catch { setError('The observation could not be confirmed. Check the register and retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function prepareVoid(e: React.FormEvent) { e.preventDefault(); setError(''); setMessage(''); if (!selectedVoid || selectedVoid.voidedAt || !reason.trim()) { setError('Select a current observation and enter a reason.'); return }; setVoidReview({ idempotencyKey: crypto.randomUUID(), observationId: selectedVoid.id, reason: reason.trim() }) }
  async function voidRecord(v: VoidRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await voiding.send(v, p => voidObligationFn({ data: { observationId: p.observationId, reason: p.reason, requestKey: p.idempotencyKey } }), isNew); setVoidReview(null); setVoidId(''); setReason(''); setMessage('Observation marked void. Its history remains in the register.'); await refresh() }
    catch { setError('The void could not be confirmed. Check the register and retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function label(o: NonNullable<typeof data>['observations'][number]) { return `${o.kind === 'borrowing' ? `External borrowing · ${o.creditor}` : `Member deposit · ${o.memberName}`} · ${o.observedDate} · ${o.currency} ${amount(o.amountMinor)} minor units · ${o.description} · ${o.id}` }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>External borrowing and member deposits</h1><p>Record dated, source-labelled observations separately for external borrowing and member deposits.</p>
    <Alert><AlertDescription>Each amount is a reported fact, not a calculated current balance. Recording an observation does not post an accounting entry or calculate interest.</AlertDescription></Alert>
    {!data ? <Alert role="alert" className="mt-6"><AlertDescription>The register is unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {message && <Alert role="status" className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}{error && <Alert role="alert" variant="destructive" className="mt-6"><AlertDescription>{error}</AlertDescription></Alert>}
      <PendingRequestNotice title="Observation" pending={recording.pending} storageError={recording.storageError} disabled={busy || refreshFailed} onRetry={() => recording.pending && void record(recording.pending, false)} onDiscard={() => discard(recording.discard)} />
      <PendingRequestNotice title="Observation void" pending={voiding.pending} storageError={voiding.storageError} disabled={busy || refreshFailed} onRetry={() => voiding.pending && void voidRecord(voiding.pending, false)} onDiscard={() => discard(voiding.discard)} />
      <Card className="mt-6"><CardHeader><CardTitle>Record an observation</CardTitle><CardDescription>Choose the source type and enter the reported amount.</CardDescription></CardHeader><CardContent>{review ? <div aria-label="Review observation" className="flex flex-col gap-3"><h3>Review the observation</h3><p>{review.kind === 'borrowing' ? `External borrowing · ${review.creditor}` : `Member deposit · ${data.members.find(m => m.id === review.memberId)?.fullName ?? 'Unknown member'}`} · {review.observedDate} · {review.currency} {amount(review.amountMinor)} minor units</p><p>Description: {review.description}</p><p>Source: {review.source}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void record(review, true)}>{busy ? 'Saving…' : 'Confirm observation'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div></div> : <form onSubmit={prepare} className="max-w-2xl"><FieldGroup>
        <Field><FieldLabel htmlFor="obligation-kind">Type</FieldLabel><NativeSelect id="obligation-kind" value={kind} disabled={locked} onChange={e => setKind(e.target.value as 'borrowing' | 'deposit')}><NativeSelectOption value="borrowing">External borrowing</NativeSelectOption><NativeSelectOption value="deposit">Member deposit</NativeSelectOption></NativeSelect></Field>
        {kind === 'borrowing' ? <Field><FieldLabel htmlFor="obligation-creditor">Creditor</FieldLabel><Input id="obligation-creditor" required maxLength={200} value={creditor} disabled={locked} onChange={e => setCreditor(e.target.value)} /></Field> : <Field><FieldLabel htmlFor="obligation-member">Member</FieldLabel><NativeSelect id="obligation-member" required value={memberId} disabled={locked} onChange={e => setMemberId(e.target.value)}><NativeSelectOption value="">Select an active member</NativeSelectOption>{data.members.filter(m => m.status === 'active').map(m => <NativeSelectOption key={m.id} value={m.id}>{m.memberNumber} · {m.fullName}</NativeSelectOption>)}</NativeSelect></Field>}
        <Field><FieldLabel htmlFor="obligation-date">Observation date</FieldLabel><DatePickerInput id="obligation-date" required type="date" value={observedDate} disabled={locked} onChange={e => setObservedDate(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="obligation-amount">Reported amount (integer minor units)</FieldLabel><Input id="obligation-amount" required inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={30} value={amountMinor} disabled={locked} onChange={e => setAmountMinor(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="obligation-currency">Currency (three-letter code)</FieldLabel><Input id="obligation-currency" required pattern="[A-Z]{3}" maxLength={3} value={currency} disabled={locked} onChange={e => setCurrency(e.target.value.toUpperCase())} /></Field>
        <Field><FieldLabel htmlFor="obligation-description">Description of reported amount</FieldLabel><Textarea id="obligation-description" required maxLength={450} value={description} disabled={locked} onChange={e => setDescription(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="obligation-source">Source</FieldLabel><Textarea id="obligation-source" required maxLength={450} value={source} disabled={locked} onChange={e => setSource(e.target.value)} /></Field>
        <Button disabled={locked}>Review observation</Button></FieldGroup></form>}</CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Recorded observations</CardTitle><CardDescription>Source details and correction history are retained.</CardDescription></CardHeader><CardContent>{data.observations.length === 0 ? <p>No observations recorded.</p> : <Table><TableHeader><TableRow><TableHead>Type and holder</TableHead><TableHead>As of</TableHead><TableHead>Amount</TableHead><TableHead>Description and source</TableHead><TableHead>Status and history</TableHead></TableRow></TableHeader><TableBody>{data.observations.map(o => <TableRow key={o.id}><TableCell>{o.kind === 'borrowing' ? `External borrowing · ${o.creditor}` : `Member deposit · ${o.memberName}`}</TableCell><TableCell>{o.observedDate}</TableCell><TableCell>{o.currency} {amount(o.amountMinor)} minor units</TableCell><TableCell>{o.description}<br />Source: {o.source}</TableCell><TableCell><Badge variant={o.voidedAt ? 'destructive' : 'secondary'}>{o.voidedAt ? 'Void' : 'Recorded'}</Badge><br />Recorded {o.createdAt} UTC<br />ID {o.id}{o.voidedAt && <><br />Voided {o.voidedAt} UTC · {o.voidReason}</>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Void an erroneous observation</CardTitle><CardDescription>Voiding preserves the source and audit history and cannot be undone. It does not reverse an accounting entry.</CardDescription></CardHeader><CardContent>{voidReview ? <div aria-label="Review void" className="flex flex-col gap-3"><h3>Review the void</h3><p>{selectedVoid ? label(selectedVoid) : voidReview.observationId}</p><p>Reason: {voidReview.reason}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void voidRecord(voidReview, true)}>{busy ? 'Saving…' : 'Confirm void'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setVoidReview(null)}>Cancel</Button></div></div> : <form onSubmit={prepareVoid} className="max-w-2xl"><FieldGroup><Field><FieldLabel htmlFor="obligation-void">Observation</FieldLabel><NativeSelect id="obligation-void" required value={voidId} disabled={locked} onChange={e => setVoidId(e.target.value)}><NativeSelectOption value="">Select an observation</NativeSelectOption>{data.observations.filter(o => !o.voidedAt).map(o => <NativeSelectOption key={o.id} value={o.id}>{label(o)}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="obligation-reason">Reason</FieldLabel><Textarea id="obligation-reason" required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></Field><Button disabled={locked || !voidId}>Review void</Button></FieldGroup></form>}</CardContent></Card>
    </>}
  </main></div>
}
