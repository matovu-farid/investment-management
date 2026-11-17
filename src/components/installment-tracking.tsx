import { SpinnerStatus } from '#/components/ui/spinner'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { DatePickerInput } from '#/components/ui/date-picker'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { confirmAction } from '#/components/confirmation-host'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { getInstallmentTrackingFn, listInstallmentPlansFn, saveInstallmentPlanFn } from '#/server/installment-tracking/functions'
import { validateScheduleCoverage } from '#/lib/installment-tracking/review-validation'

type Row = { dueDate: string; principalMinor: string; interestMinor: string }
type Request = {
  idempotencyKey: string
  loanId: string
  expectedConfigKey: string
  expectedRevision: number
  expectedPreviousPlanId: string | null
  source: string
  reason: string
  coverageStart: string
  historyComplete: boolean
  openingPaymentHistory: 'known' | 'none' | 'unknown'
  openingLastAppliedDate: string | null
  rows: Row[]
}
type Plans = Awaited<ReturnType<typeof listInstallmentPlansFn>>
type Tracking = Awaited<ReturnType<typeof getInstallmentTrackingFn>>
const emptyRow = (): Row => ({ dueDate: '', principalMinor: '0', interestMinor: '0' })
const amount = (value: string) => BigInt(value).toLocaleString('en-US')
const riskLabel: Record<string, string> = { smooth: 'Smooth (no overdue as of date)', mild: 'Mild risk', risky: 'Risky', 'very-risky': 'Very risky', review: 'Requires review', unknown: 'Unknown' }

export function InstallmentTracking({ loanId, currency, userId, revision, disabled }: { loanId: string; currency: string; userId: string; revision: number; disabled: boolean }) {
  const [plans, setPlans] = useState<Plans | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [source, setSource] = useState('')
  const [reason, setReason] = useState('')
  const [coverageStart, setCoverageStart] = useState('')
  const [historyComplete, setHistoryComplete] = useState(false)
  const [openingPaymentHistory, setOpeningPaymentHistory] = useState<'' | 'known' | 'none' | 'unknown'>('')
  const [openingLastAppliedDate, setOpeningLastAppliedDate] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [review, setReview] = useState<Request | null>(null)
  const [asOfDate, setAsOfDate] = useState('')
  const [tracking, setTracking] = useState<Tracking | null>(null)
  const [trackingRevision, setTrackingRevision] = useState<number | null>(null)
  const pending = usePendingRequest<Request>(userId, `installment-plan-save:${loanId}`)
  const locked = disabled || busy || !pending.ready || !!pending.pending || !!pending.storageError

  const refresh = useCallback(async () => {
    const result = await listInstallmentPlansFn({ data: { loanId } })
    setPlans(result)
    return result
  }, [loanId])

  useEffect(() => {
    let active = true
    setLoading(true)
    listInstallmentPlansFn({ data: { loanId } }).then(result => { if (active) setPlans(result) }).catch(() => { if (active) setError('The installment register could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loanId])

  const current = plans?.plans.find(plan => plan.active) ?? null
  const editRow = (index: number, patch: Partial<Row>) => {
    setRows(previous => previous.map((row, i) => i === index ? { ...row, ...patch } : row))
    setReview(null)
  }
  async function send(payload: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(payload, value => saveInstallmentPlanFn({ data: { ...value, requestKey: value.idempotencyKey } }), isNew)
      setReview(null); setTracking(null); setRows([emptyRow()]); setSource(''); setReason(''); setCoverageStart(''); setHistoryComplete(false); setOpeningPaymentHistory(''); setOpeningLastAppliedDate('')
      try { await refresh(); setMessage('Reviewed installment schedule saved. Existing receipts and journals were not changed.') }
      catch { setPlans(null); setMessage('Reviewed installment schedule saved, but its history could not be refreshed. Reload the page to see it.') }
    } catch (e) { setError(e instanceof Error ? e.message : 'The schedule was not confirmed. Check its history and retry the retained request unchanged.') }
    finally { setBusy(false) }
  }
  function prepareReview(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!plans?.config || !source.trim() || !reason.trim() || !coverageStart || !rows.length) { setError('Complete the source, reason, coverage date and at least one installment.'); return }
    if (plans.revision !== revision) { setError('Loan records changed. Reload the page before reviewing a schedule.'); return }
    if (plans.openingExists && !plans.opening) { setError('Review the brought-forward billing snapshot before recording a schedule.'); return }
    if (plans.openingExists && !openingPaymentHistory) { setError('Select what is known about applied payments before the opening cutoff.'); return }
    if (plans.opening && openingPaymentHistory === 'known' && (!openingLastAppliedDate || openingLastAppliedDate > plans.opening.openingDate || openingLastAppliedDate < plans.config.disbursementDate)) { setError('Enter the last applied payment date between disbursement and the opening cutoff.'); return }
    if (historyComplete && coverageStart !== (plans.opening?.openingDate ?? plans.config.disbursementDate)) { setError('Complete history must start at the original disbursement date or the reviewed brought-forward cutoff.'); return }
    const values = rows.map(row => ({ dueDate: row.dueDate, principalMinor: row.principalMinor.trim(), interestMinor: row.interestMinor.trim() }))
    if (values.some(row => !row.dueDate || !/^(0|[1-9]\d*)$/.test(row.principalMinor) || !/^(0|[1-9]\d*)$/.test(row.interestMinor) || (BigInt(row.principalMinor) === 0n && BigInt(row.interestMinor) === 0n))) { setError('Each installment needs a date and non-negative whole minor-unit amounts, with principal or interest greater than zero.'); return }
    if (values.some((row, i) => (!plans.openingExists && historyComplete && row.dueDate < coverageStart) || (i > 0 && row.dueDate <= values[i - 1].dueDate))) { setError('Enter installments in strictly increasing date order. For loans without a brought-forward opening, complete history cannot include installments before its coverage date.'); return }
    const coverageError = validateScheduleCoverage({ historyComplete, coverageStart, disbursementDate: plans.config.disbursementDate, originalPrincipalMinor: plans.config.principalMinor, opening: plans.opening, rows: values })
    if (coverageError) { setError(coverageError); return }
    setReview({ idempotencyKey: crypto.randomUUID(), loanId, expectedConfigKey: plans.config.requestKey, expectedRevision: revision, expectedPreviousPlanId: current?.id ?? null, source: source.trim(), reason: reason.trim(), coverageStart, historyComplete, openingPaymentHistory: plans.openingExists ? openingPaymentHistory as 'known' | 'none' | 'unknown' : 'none', openingLastAppliedDate: plans.openingExists && openingPaymentHistory === 'known' ? openingLastAppliedDate : null, rows: values })
  }
  async function showTracking(event: React.FormEvent) {
    event.preventDefault(); setError(''); setTracking(null); setBusy(true)
    try { setTracking(await getInstallmentTrackingFn({ data: { loanId, asOfDate } })); setTrackingRevision(revision) }
    catch (e) { setError(e instanceof Error ? e.message : 'Installment tracking could not be calculated.') }
    finally { setBusy(false) }
  }

  return <Card className="mt-6" data-testid="installment-tracking">
    <CardHeader><CardTitle>Installments and repayment tracking</CardTitle><CardDescription>Review agreed installments and track actual posted repayments against them.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Alert><AlertDescription>The schedule is a reviewed record of the repayment promise, not an automatic journal or a demand. Actual principal and interest are allocated separately from posted billing repayments, oldest installment first; corrections are reflected when recalculated. A forecast does not become a schedule until explicitly reviewed here. The as-of view uses the latest reviewed schedule and current records, including later-entered backdated information; it does not reconstruct what was known on that date. A paid schedule is not proof that the entire loan is settled. Risk indicators are provisional and do not freeze a loan or write it off.</AlertDescription></Alert>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <PendingRequestNotice title="Installment schedule" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={async () => { if (await confirmAction('This schedule may already have been saved. Check the history before discarding the retained request. Discard?')) pending.discard() }} />
      {loading ? <SpinnerStatus label="Fetching installment schedules…" /> : !plans ? <p>Schedule history is unavailable. Reload the page to try again.</p> : <>
        <section className="flex flex-col gap-2" aria-label="Schedule history">
          <h3>Schedule history</h3>
          {plans.plans.length ? <ul>{plans.plans.map(plan => <li key={plan.id}><details><summary>{plan.createdAt} · {plan.active ? 'Current' : 'Replaced'}{plan.stale ? ' · loan terms changed; review needed' : ''} · {plan.rows.length} {plan.rows.length === 1 ? 'installment' : 'installments'} · {plan.source}</summary><p>Coverage from {plan.coverageStart} · {plan.historyComplete ? 'obligations reviewed complete' : 'history not confirmed complete'} · reason: {plan.reason}.</p>{plans.openingExists && <p>Opening payment history: {plan.openingPaymentHistory === 'known' ? `last applied payment ${plan.openingLastAppliedDate}` : plan.openingPaymentHistory === 'none' ? 'reviewed as no earlier applied payments' : 'unknown'}. Rows are balances still due at the cutoff.</p>}<Table><TableHeader><TableRow><TableHead>Due date</TableHead><TableHead>Principal ({currency} minor units)</TableHead><TableHead>Interest ({currency} minor units)</TableHead></TableRow></TableHeader><TableBody>{plan.rows.map(row => <TableRow key={row.dueDate}><TableCell>{row.dueDate}</TableCell><TableCell>{amount(row.principalMinor)}</TableCell><TableCell>{amount(row.interestMinor)}</TableCell></TableRow>)}</TableBody></Table></details></li>)}</ul> : <p>No reviewed installment schedule has been recorded.</p>}
        </section>
        {current && <form onSubmit={showTracking}><FieldGroup>
          <Field><FieldLabel htmlFor="tracking-as-of">Track repayments as of</FieldLabel><DatePickerInput id="tracking-as-of" required value={asOfDate} disabled={disabled || busy} onChange={event => { setAsOfDate(event.target.value); setTracking(null) }} /></Field>
          <div><Button disabled={disabled || busy}>View installment status</Button></div>
        </FieldGroup></form>}
        {tracking && <section className="flex flex-col gap-3" aria-live="polite" aria-label="Installment status">
          <h3>Installment status as of {tracking.asOfDate}</h3>
          {trackingRevision !== revision && <Alert variant="destructive"><AlertDescription>Loan records changed after this view was calculated. Select the date and refresh the installment status.</AlertDescription></Alert>}
          {!tracking.coverageComplete && !tracking.scheduleBalanceConflict && <Alert variant="destructive"><AlertDescription>Payment or schedule history is incomplete or requires reconciliation. Risk and arrears may not reflect the full loan history.</AlertDescription></Alert>}
          {tracking.scheduleBalanceConflict && <Alert variant="destructive"><AlertDescription>The calculated principal and accrued unpaid interest are zero, but the reviewed schedule still contains unpaid installments. Reconcile the schedule and billing records; risk and the no-payment indicator are withheld.</AlertDescription></Alert>}
          {tracking.plan.stale && <Alert variant="destructive"><AlertDescription>Loan terms changed since this schedule was reviewed. Reconcile and review a replacement before relying on it.</AlertDescription></Alert>}
          {plans.openingExists && <Alert><AlertDescription>Installment amounts represent the balances still due at the brought-forward cutoff. Paid columns and allocations show only payments after the cutoff. {tracking.plan.openingPaymentHistory === 'unknown' ? 'Earlier payment history is unknown, so risk and the no-payment measure remain unknown.' : tracking.plan.openingPaymentHistory === 'known' ? `The reviewed last applied payment on or before the cutoff was ${tracking.plan.openingLastAppliedDate}.` : 'The review records no applied payment before the cutoff.'}</AlertDescription></Alert>}
          {!tracking.ledgerCheckComplete && <Alert variant="destructive"><AlertDescription>The billing balance could not be fully reconciled to this schedule. Review the schedule and billing records before relying on risk or treating the loan as settled.</AlertDescription></Alert>}
          {((tracking.unplannedPrincipalMinor !== null && BigInt(tracking.unplannedPrincipalMinor) > 0n) || (tracking.unplannedInterestMinor !== null && BigInt(tracking.unplannedInterestMinor) > 0n)) && <p>Unplanned balance requiring review: principal {tracking.unplannedPrincipalMinor === null ? 'unknown' : amount(tracking.unplannedPrincipalMinor)} · interest {tracking.unplannedInterestMinor === null ? 'unknown' : amount(tracking.unplannedInterestMinor)} {currency} minor units.</p>}
          <p>Oldest unpaid among reviewed installments: {tracking.oldestUnpaidDueDate ?? 'none identified'} · days overdue on that installment: {tracking.daysOverdue === null ? 'unknown' : tracking.daysOverdue} · provisional risk: {riskLabel[tracking.risk] ?? 'Unknown'}. Smooth does not establish that earlier payments were consistently on time.</p>
          <p>Last applied payment date (including reviewed opening history): {tracking.lastPaymentDate ?? 'none recorded in the covered history'}. Six calendar months without a payment: {tracking.noPaymentSixMonths === null ? 'unknown' : tracking.noPaymentSixMonths ? 'yes — review the credit protocol' : 'no'}. This is a separate measure from installment overdue days.{plans.openingExists && ' A date from opening history is reviewed evidence; only the later posted receipts listed below have linked journals in this view.'}</p>
          {tracking.noPaymentSixMonths === true && trackingRevision === revision && <Alert><AlertDescription>The credit protocol calls for debt to be frozen after six months of non-payment and for the write-off process to be triggered. Review the underlying records and the group's approval and recovery process. This indicator does not freeze the debt or write it off. <Link to="/collateral" search={{loan:loanId}} hash="recovery-note">Record a recovery note</Link>.</AlertDescription></Alert>}
          <p>Installment amounts are shown in {currency} minor units.</p><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Due date</TableHead><TableHead>Status from recorded payments</TableHead><TableHead>Principal due</TableHead><TableHead>Interest due</TableHead><TableHead>Principal paid</TableHead><TableHead>Interest paid</TableHead><TableHead>Principal remaining</TableHead><TableHead>Interest remaining</TableHead><TableHead>Allocated repayments</TableHead></TableRow></TableHeader><TableBody>{tracking.rows.map(row => <TableRow key={row.dueDate}><TableCell>{row.dueDate}</TableCell><TableCell>{BigInt(row.principalRemainingMinor) + BigInt(row.interestRemainingMinor) === 0n ? 'Paid' : row.dueDate < tracking.asOfDate ? 'Overdue' : row.dueDate === tracking.asOfDate ? 'Due today' : 'Upcoming'}</TableCell><TableCell>{amount(row.principalMinor)}</TableCell><TableCell>{amount(row.interestMinor)}</TableCell><TableCell>{amount(row.principalPaidMinor)}</TableCell><TableCell>{amount(row.interestPaidMinor)}</TableCell><TableCell>{amount(row.principalRemainingMinor)}</TableCell><TableCell>{amount(row.interestRemainingMinor)}</TableCell><TableCell>{row.allocations.length ? <ul>{row.allocations.map(allocation => <li key={allocation.repaymentId}>{allocation.date} · receipt {allocation.repaymentId} · principal {amount(allocation.principalMinor)}, interest {amount(allocation.interestMinor)} · journal {allocation.journalId}</li>)}</ul> : '—'}</TableCell></TableRow>)}</TableBody></Table></div>
          <p>Unmatched posted principal: {amount(tracking.unmatchedPrincipalMinor)} · unmatched posted interest: {amount(tracking.unmatchedInterestMinor)} · unapplied receipts: {amount(tracking.unappliedMinor)} {currency} minor units. These amounts are not silently assigned to another component.</p>
          <p>Recorded receipts awaiting billing posting: {tracking.pendingReceipts}. Unposted receipts do not count as paid installments.</p>
          {tracking.payments.length > 0 && <details><summary>Posted repayment sources</summary><ul>{tracking.payments.map(payment => <li key={payment.id}>{payment.date} · receipt {payment.id} · principal {amount(payment.principalMinor)}, interest {amount(payment.interestMinor)}, unapplied {amount(payment.unappliedMinor)} · journal {payment.journalId}</li>)}</ul></details>}
        </section>}
        <section className="flex flex-col gap-3" aria-label="Review installment schedule">
          <h3>{current ? 'Review a replacement schedule' : 'Review an agreed schedule'}</h3>
          <p>Enter the agreed installments. A replacement retains the prior schedule; it does not alter a repayment or journal. Complete history must begin at {plans.opening?.openingDate ?? plans.config?.disbursementDate ?? 'the reviewed opening date'}.</p>
          {plans.opening && <Alert><AlertDescription>For this brought-forward loan, enter amounts still outstanding at the cutoff of {plans.opening.openingDate}, including installments already overdue on that date. These are residual balances, not the original installment amounts. For a complete schedule, residual principal must total {amount(plans.opening.principalMinor)} and residual interest must cover at least {amount(plans.opening.interestDueMinor)} {currency} minor units. Incomplete history can be recorded, but cannot produce a definitive risk classification. Confirm whether the last earlier applied payment is known; unknown history keeps risk and no-payment status unknown.</AlertDescription></Alert>}
          {!review ? <form onSubmit={prepareReview}><FieldGroup>
            <Field><FieldLabel htmlFor="schedule-source">Agreement or source reference</FieldLabel><Input id="schedule-source" required maxLength={450} value={source} disabled={locked} onChange={event => setSource(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="schedule-reason">Reason for recording or replacing</FieldLabel><Input id="schedule-reason" required maxLength={450} value={reason} disabled={locked} onChange={event => setReason(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="schedule-coverage">History coverage starts</FieldLabel><DatePickerInput id="schedule-coverage" required value={coverageStart} disabled={locked} onChange={event => setCoverageStart(event.target.value)} /></Field>
            {plans.openingExists && <Field><FieldLabel htmlFor="opening-payment-history">Applied payments on or before the opening cutoff</FieldLabel><NativeSelect id="opening-payment-history" value={openingPaymentHistory} required disabled={locked} onChange={event => { setOpeningPaymentHistory(event.target.value as '' | 'known' | 'none' | 'unknown'); setOpeningLastAppliedDate('') }}><NativeSelectOption value="">Select reviewed history</NativeSelectOption><NativeSelectOption value="known">Last applied payment date is known</NativeSelectOption><NativeSelectOption value="none">Reviewed: no earlier applied payment</NativeSelectOption><NativeSelectOption value="unknown">Unknown or not reviewed</NativeSelectOption></NativeSelect></Field>}
            {plans.openingExists && openingPaymentHistory === 'known' && <Field><FieldLabel htmlFor="opening-last-payment">Last applied payment on or before the cutoff</FieldLabel><DatePickerInput id="opening-last-payment" required min={plans.config?.disbursementDate} max={plans.opening?.openingDate} value={openingLastAppliedDate} disabled={locked} onChange={event => setOpeningLastAppliedDate(event.target.value)} /></Field>}
            <Field><label className="flex items-start gap-2"><Checkbox checked={historyComplete} disabled={locked} onCheckedChange={value => setHistoryComplete(value === true)} />{plans.openingExists ? 'I reviewed all outstanding installment obligations at the cutoff and the payment history from the cutoff.' : 'I reviewed the complete installment and payment history from the coverage date.'}</label></Field>
            {rows.map((row, index) => <fieldset key={index} disabled={locked} className="flex flex-col gap-3 rounded-md border p-4"><legend>Installment {index + 1}</legend><Field><FieldLabel htmlFor={`schedule-date-${index}`}>Due date</FieldLabel><DatePickerInput id={`schedule-date-${index}`} required value={row.dueDate} onChange={event => editRow(index, { dueDate: event.target.value })} /></Field><Field><FieldLabel htmlFor={`schedule-principal-${index}`}>Principal due ({currency} minor units)</FieldLabel><Input id={`schedule-principal-${index}`} required inputMode="numeric" value={row.principalMinor} onChange={event => editRow(index, { principalMinor: event.target.value })} /></Field><Field><FieldLabel htmlFor={`schedule-interest-${index}`}>Interest due ({currency} minor units)</FieldLabel><Input id={`schedule-interest-${index}`} required inputMode="numeric" value={row.interestMinor} onChange={event => editRow(index, { interestMinor: event.target.value })} /></Field>{rows.length > 1 && <div><Button type="button" variant="outline" onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}>Remove installment {index + 1}</Button></div>}</fieldset>)}
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={locked || rows.length >= 120} onClick={() => setRows(previous => [...previous, emptyRow()])}>Add installment</Button><Button disabled={locked}>Review schedule</Button></div>
          </FieldGroup></form> : <div role="region" aria-label="Confirm installment schedule" className="flex flex-col gap-3"><p>Source: {review.source} · reason: {review.reason} · coverage from {review.coverageStart} · history {review.historyComplete ? 'reviewed complete' : 'not confirmed complete'}.</p>{plans.openingExists && <p>Rows are residual balances due at the cutoff. Earlier applied payment history: {review.openingPaymentHistory === 'known' ? `last applied ${review.openingLastAppliedDate}` : review.openingPaymentHistory === 'none' ? 'reviewed as none' : 'unknown'}.</p>}<Table><TableHeader><TableRow><TableHead>Due date</TableHead><TableHead>Principal ({currency} minor units)</TableHead><TableHead>Interest ({currency} minor units)</TableHead></TableRow></TableHeader><TableBody>{review.rows.map(row => <TableRow key={row.dueDate}><TableCell>{row.dueDate}</TableCell><TableCell>{amount(row.principalMinor)}</TableCell><TableCell>{amount(row.interestMinor)}</TableCell></TableRow>)}</TableBody></Table><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void send(review, true)}>Save reviewed schedule</Button><Button type="button" variant="outline" disabled={locked} onClick={() => setReview(null)}>Change schedule</Button></div></div>}
        </section>
      </>}
    </CardContent>
  </Card>
}
