import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
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
import { listReportedLoanBalancesFn, recordReportedLoanBalanceFn, voidReportedLoanBalanceFn } from '#/server/reported-loan-balances/functions'

export const Route = createFileRoute('/reported-loan-balances')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => listReportedLoanBalancesFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: ReportedLoanBalances,
})

type RecordRequest = { idempotencyKey: string; loanId: string; observedDate: string; amountMinor: string; basis: string; source: string }
type VoidRequest = { idempotencyKey: string; observationId: string; reason: string }
const amount = (value: string | number) => BigInt(value).toLocaleString('en-US')

function ReportedLoanBalances() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const recording = usePendingRequest<RecordRequest>(userId, 'reported-loan-balance')
  const voiding = usePendingRequest<VoidRequest>(userId, 'reported-loan-balance-void')
  const [loanId, setLoanId] = useState(''), [observedDate, setObservedDate] = useState(''), [amountMinor, setAmountMinor] = useState(''), [basis, setBasis] = useState(''), [source, setSource] = useState('')
  const [observationId, setObservationId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<RecordRequest | null>(null), [voidReview, setVoidReview] = useState<VoidRequest | null>(null)
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const locked = busy || refreshFailed || !recording.ready || !voiding.ready || !!recording.pending || !!voiding.pending || !!recording.storageError || !!voiding.storageError
  const selectedLoan = data?.loans.find(l => l.id === loanId)
  const selectedVoid = data?.observations.find(o => o.id === observationId)
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the register could not refresh. Reload before making another change.') } }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check the register before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!selectedLoan || !observedDate || !/^(0|[1-9][0-9]{0,29})$/.test(amountMinor) || !basis.trim() || !source.trim()) { setError('Select a loan and enter a date, non-negative whole amount, basis and source.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), loanId: selectedLoan.id, observedDate, amountMinor, basis: basis.trim(), source: source.trim() })
  }
  async function record(v: RecordRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await recording.send(v, async p => { const { idempotencyKey, ...details } = p; const result = await recordReportedLoanBalanceFn({ data: { ...details, requestKey: idempotencyKey } }); active = result.active }, isNew)
      setReview(null); setLoanId(''); setObservedDate(''); setAmountMinor(''); setBasis(''); setSource('')
      setMessage(active ? 'Reported balance recorded.' : 'This observation was recorded earlier and is now void.'); await refresh()
    } catch { setError('The observation could not be confirmed. Check the loan and register, then retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function prepareVoid(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!selectedVoid || selectedVoid.voidedAt || !reason.trim()) { setError('Select a current observation and enter a reason.'); return }
    setVoidReview({ idempotencyKey: crypto.randomUUID(), observationId: selectedVoid.id, reason: reason.trim() })
  }
  async function voidRecord(v: VoidRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await voiding.send(v, p => voidReportedLoanBalanceFn({ data: { observationId: p.observationId, reason: p.reason, requestKey: p.idempotencyKey } }), isNew); setVoidReview(null); setObservationId(''); setReason(''); setMessage('Observation marked void. Its history remains in the register.'); await refresh() }
    catch { setError('The void could not be confirmed. Check the register and retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function label(o: NonNullable<typeof data>['observations'][number]) { return `${o.memberName} · ${o.memberNumber} · ${o.observedDate} · ${o.currency} ${amount(o.amountMinor)} minor units · loan ${o.loanId} · observation ${o.id}` }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans</Link></header><main className="dashboard flex flex-col gap-6">
    <div><p className="eyebrow">ADMINISTRATION</p><h1>Loan balance observations</h1><p>Record a balance reported by a source for an individual loan, whether or not the borrower has an app account.</p><p><Link to="/reported-loan-balance-import">Import reported loan balances →</Link></p></div>
    <Alert><AlertDescription>These observations are administrator records. Amounts are not calculated or verified by the app, may not be current, and do not establish settlement. Recording an observation does not publish it to a member, allocate repayments, calculate interest or post to the ledger.</AlertDescription></Alert>
    {!data ? <Alert variant="destructive" role="alert"><AlertDescription>The register is unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <PendingRequestNotice title="Loan balance observation" pending={recording.pending} storageError={recording.storageError} disabled={busy || refreshFailed} onRetry={() => recording.pending && void record(recording.pending, false)} onDiscard={() => discard(recording.discard)} />
      <PendingRequestNotice title="Observation void" pending={voiding.pending} storageError={voiding.storageError} disabled={busy || refreshFailed} onRetry={() => voiding.pending && void voidRecord(voiding.pending, false)} onDiscard={() => discard(voiding.discard)} />
      <Card><CardHeader><CardTitle>Record an observation</CardTitle><CardDescription>Use the balance and date supplied by the source. The amount uses the loan currency. The date must be on or after disbursement and no later than today in Kampala.</CardDescription></CardHeader><CardContent>
        {review && selectedLoan ? <div aria-label="Review observation" className="flex flex-col gap-3"><h3>Review the observation</h3><p>{selectedLoan.memberName} · {selectedLoan.memberNumber} · loan {selectedLoan.id}</p><p>Loan disbursed {selectedLoan.disbursementDate} · original principal {selectedLoan.currency} {amount(selectedLoan.principalMinor)} minor units</p><p>Reported as of {review.observedDate}: {selectedLoan.currency} {amount(review.amountMinor)} minor units</p><p>Basis: {review.basis}</p><p>Source: {review.source}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void record(review, true)}>{busy ? <SpinnerLabel>Confirm observation</SpinnerLabel> : 'Confirm observation'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div></div> :
        <form onSubmit={prepare} className="max-w-2xl"><FieldGroup>
          <Field><FieldLabel htmlFor="balance-loan">Loan</FieldLabel><NativeSelect id="balance-loan" required value={loanId} disabled={locked} onChange={e => setLoanId(e.target.value)}><NativeSelectOption value="">Select a loan</NativeSelectOption>{data.loans.map(l => <NativeSelectOption key={l.id} value={l.id}>{l.memberName} · {l.memberNumber} · {l.currency} {amount(l.principalMinor)} minor units · {l.disbursementDate} · loan {l.id}</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="balance-date">As-of date</FieldLabel><DatePickerInput id="balance-date" required value={observedDate} disabled={locked} onChange={e => setObservedDate(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="balance-amount">Reported amount (integer minor units)</FieldLabel><Input id="balance-amount" required inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={30} value={amountMinor} disabled={locked} onChange={e => setAmountMinor(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="balance-basis">Basis</FieldLabel><Textarea id="balance-basis" required maxLength={500} value={basis} disabled={locked} onChange={e => setBasis(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="balance-source">Source</FieldLabel><Textarea id="balance-source" required maxLength={500} value={source} disabled={locked} onChange={e => setSource(e.target.value)} /></Field>
          <Button disabled={locked || !selectedLoan}>Review observation</Button>
        </FieldGroup></form>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Recorded observations</CardTitle><CardDescription>Source details and void history are retained. Observations are not automatically selected as current balances.</CardDescription></CardHeader><CardContent>{data.observations.length === 0 ? <p>No observations recorded.</p> : <Table><TableHeader><TableRow><TableHead>Borrower and loan</TableHead><TableHead>As of</TableHead><TableHead>Amount (minor units)</TableHead><TableHead>Basis and source</TableHead><TableHead>Recorded</TableHead><TableHead>Status and history</TableHead></TableRow></TableHeader><TableBody>{data.observations.map(o => <TableRow key={o.id}><TableCell>{o.memberName} · {o.memberNumber}<br />Loan {o.loanId}{o.loanVoidedAt && <><br /><Badge variant="destructive">Source loan void</Badge><br />{o.loanVoidedAt} UTC · {o.loanVoidReason}</>}</TableCell><TableCell>{o.observedDate}</TableCell><TableCell>{o.currency} {amount(o.amountMinor)}</TableCell><TableCell>{o.basis}<br />Source: {o.source}<br />{o.importSourceRef !== null ? <>Imported reference: {o.importSourceRef}<br />Import batch: {o.importBatchId}</> : <>Manually recorded</>}</TableCell><TableCell>{o.createdAt} UTC · {o.createdBy}<br />ID {o.id}</TableCell><TableCell>{o.voidedAt ? <><Badge variant="destructive">Void</Badge><br />{o.voidedAt} UTC by {o.voidedBy} · {o.voidReason}</> : <Badge variant="secondary">Recorded</Badge>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Void an erroneous observation</CardTitle><CardDescription>Voiding preserves the source and audit history and cannot be undone. It does not reverse an accounting entry.</CardDescription></CardHeader><CardContent>
        {voidReview ? <div aria-label="Review void" className="flex flex-col gap-3"><h3>Review the void</h3><p>{selectedVoid ? label(selectedVoid) : voidReview.observationId}</p><p>Reason: {voidReview.reason}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={locked} onClick={() => void voidRecord(voidReview, true)}>{busy ? <SpinnerLabel>Confirm void</SpinnerLabel> : 'Confirm void'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setVoidReview(null)}>Edit</Button></div></div> :
        <form onSubmit={prepareVoid} className="max-w-2xl"><FieldGroup><Field><FieldLabel htmlFor="balance-void-id">Observation</FieldLabel><NativeSelect id="balance-void-id" required value={observationId} disabled={locked} onChange={e => setObservationId(e.target.value)}><NativeSelectOption value="">Select an observation</NativeSelectOption>{data.observations.filter(o => !o.voidedAt).map(o => <NativeSelectOption key={o.id} value={o.id}>{label(o)}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="balance-void-reason">Reason</FieldLabel><Textarea id="balance-void-reason" required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></Field><Button disabled={locked || !observationId}>Review void</Button></FieldGroup></form>}
      </CardContent></Card>
    </>}
  </main></div>
}
