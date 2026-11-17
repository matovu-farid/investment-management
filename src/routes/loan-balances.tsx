import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { CalculatedBalancePublications } from '#/components/calculated-balance-publications'
import { adminCalculatedBalancesFn } from '#/server/billing-publications/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { adminLoanBalancesFn, publishLoanBalanceFn, publishObservedLoanBalanceFn, withdrawLoanBalanceFn } from '#/server/loan-balances/functions'

export const Route = createFileRoute('/loan-balances')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => { const [balances, calculated] = await Promise.all([adminLoanBalancesFn().catch(() => null), adminCalculatedBalancesFn().catch(() => null)]); return { balances, calculated } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: LoanBalances,
})
type Data = NonNullable<Awaited<ReturnType<typeof adminLoanBalancesFn>>>
type Loan = Data['loans'][number]
type PublishRequest = { idempotencyKey: string; loanId: string; preview: Pick<Loan, 'memberId' | 'memberName' | 'memberNumber' | 'linkId' | 'userId' | 'userName' | 'userEmail' | 'currency' | 'disbursementDate' | 'principalMinor'>; observedDate: string; amountMinor: string; basis: string; source: string }
type ObservedRequest = PublishRequest & { observationId: string }
type WithdrawRequest = { idempotencyKey: string; publicationId: string }
const number = (s: string | number) => BigInt(s).toLocaleString('en-US')

function LoanBalances() {
  const loaded = Route.useLoaderData(), data = loaded.balances, { userId } = Route.useRouteContext(), router = useRouter()
  const [loanId, setLoanId] = useState(''), [observedDate, setObservedDate] = useState(''), [amountMinor, setAmountMinor] = useState(''), [basis, setBasis] = useState(''), [source, setSource] = useState('')
  const [review, setReview] = useState<PublishRequest | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const publishing = usePendingRequest<PublishRequest>(userId, 'loan-balance-publish')
  const [observationId, setObservationId] = useState(''), [observedReview, setObservedReview] = useState<ObservedRequest | null>(null)
  const observedPublishing = usePendingRequest<ObservedRequest>(userId, 'loan-balance-observed-publish')
  const withdrawing = usePendingRequest<WithdrawRequest>(userId, 'loan-balance-withdraw')
  const locked = busy || refreshFailed || !publishing.ready || !withdrawing.ready || !observedPublishing.ready || !!observedPublishing.pending || !!observedPublishing.storageError || !!publishing.pending || !!withdrawing.pending || !!publishing.storageError || !!withdrawing.storageError
  const loan = data?.loans.find(item => item.id === loanId)
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the register could not refresh. Reload before continuing.') } }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check the publication history before discarding it. Discard the request?')) { try { action() } catch { setError('Could not discard the pending request.') } } }
  function prepare(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!loan || !observedDate || !/^(0|[1-9][0-9]{0,29})$/.test(amountMinor) || !basis.trim() || !source.trim()) { setError('Select a loan and enter a date, whole-number amount, basis and source.'); return }
    const { memberId, memberName, memberNumber, linkId, userId: recipientUserId, userName, userEmail, currency, disbursementDate, principalMinor } = loan
    setReview({ loanId: loan.id, preview: { memberId, memberName, memberNumber, linkId, userId: recipientUserId, userName, userEmail, currency, disbursementDate, principalMinor }, observedDate, amountMinor, basis: basis.trim(), source: source.trim(), idempotencyKey: crypto.randomUUID() })
  }
  async function publish(request: PublishRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await publishing.send(request, async p => { const result = await publishLoanBalanceFn({ data: { loanId: p.loanId, preview: p.preview, observedDate: p.observedDate, amountMinor: p.amountMinor, basis: p.basis, source: p.source, requestKey: p.idempotencyKey } }); active = result.active }, isNew)
      setReview(null); setLoanId(''); setObservedDate(''); setAmountMinor(''); setBasis(''); setSource('')
      setMessage(active ? 'Reported balance published to the reviewed borrower account.' : 'This publication was recorded previously and is no longer visible.'); await refresh()
    } catch { setError('Publication could not be confirmed. Check history and retry the retained request unchanged. If the loan or borrower link changed, discard the request after checking history and review current details.') }
    finally { setBusy(false) }
  }
  function prepareObserved(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    const row = data?.observations.find(item => item.observationId === observationId)
    if (!row) { setError('Choose an available recorded observation.'); return }
    const { memberId, memberName, memberNumber, linkId, userId: recipientUserId, userName, userEmail, currency, disbursementDate, principalMinor } = row
    setObservedReview({ observationId: row.observationId, loanId: row.loanId, preview: { memberId, memberName, memberNumber, linkId, userId: recipientUserId, userName, userEmail, currency, disbursementDate, principalMinor }, observedDate: row.observedDate, amountMinor: row.amountMinor, basis: row.basis, source: row.source, idempotencyKey: crypto.randomUUID() })
  }
  async function publishObserved(request: ObservedRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await observedPublishing.send(request, async p => { const { idempotencyKey, ...details } = p; const result = await publishObservedLoanBalanceFn({ data: { ...details, requestKey: idempotencyKey } }); active = result.active }, isNew)
      setObservedReview(null); setObservationId(''); setMessage(active ? 'Recorded observation published to the reviewed borrower account.' : 'This publication was recorded previously and is no longer visible.'); await refresh()
    } catch { setError('Publication could not be confirmed. Check history and retry the retained request unchanged. If the observation or borrower link changed, discard after checking history and review current details.') }
    finally { setBusy(false) }
  }
  async function withdraw(request: WithdrawRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await withdrawing.send(request, p => withdrawLoanBalanceFn({ data: { publicationId: p.publicationId, requestKey: p.idempotencyKey } }), isNew); setMessage('Reported balance withdrawn.'); await refresh() }
    catch { setError('Withdrawal could not be confirmed. Check history and retry the retained request unchanged.') }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Reported loan balances</h1><p>Publish a reviewed calculated snapshot or a balance supplied by a source for a recorded loan. Neither is necessarily current or approved, and neither establishes a settlement. Publishing does not create an accounting entry.</p>
    {!data ? <section className="record-panel"><Alert variant="destructive" role="alert"><AlertDescription>Loan balances are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert></section> : <>
      {loaded.calculated ? <CalculatedBalancePublications loans={data.loans} history={loaded.calculated} userId={userId} refresh={refresh} /> : <Alert variant="destructive"><AlertDescription>Calculated balance publications are unavailable. Reload to try again.</AlertDescription></Alert>}
      {message && <p role="status">{message}</p>}{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card className="mt-6"><CardHeader><CardTitle>Publish a recorded observation</CardTitle><CardDescription>Choose a source observation for a loan with an active linked borrower account. Review the recipient and source text before publishing; withdrawing the publication allows the source observation to be voided.</CardDescription></CardHeader><CardContent>
        <PendingRequestNotice title="Observation publication" pending={observedPublishing.pending} storageError={observedPublishing.storageError} disabled={busy || refreshFailed} onRetry={() => observedPublishing.pending && void publishObserved(observedPublishing.pending, false)} onDiscard={() => discard(observedPublishing.discard)} />
        {observedReview ? <div aria-label="Confirm observation publication"><h3>Member-visible preview and recipient</h3><p>Borrower: {observedReview.preview.memberName} · {observedReview.preview.memberNumber}</p><p>Account: {observedReview.preview.userName} · {observedReview.preview.userEmail} · link {observedReview.preview.linkId}</p><p>Loan {observedReview.loanId} · disbursed {observedReview.preview.disbursementDate} · principal {observedReview.preview.currency} {number(observedReview.preview.principalMinor)} minor units</p><p>Balance as reported on {observedReview.observedDate}: <strong>{observedReview.preview.currency} {number(observedReview.amountMinor)} minor units</strong></p><p>Basis: {observedReview.basis} · source: {observedReview.source}</p><p>Observation {observedReview.observationId}. Verify the source and recipient; publication shares these details with this account.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void publishObserved(observedReview, true)}>Publish observation</Button><Button type="button" variant="outline" disabled={locked} onClick={() => setObservedReview(null)}>Edit</Button></div></div> : <form onSubmit={prepareObserved}><FieldGroup><Field><FieldLabel htmlFor="balance-observation">Recorded observation</FieldLabel><NativeSelect id="balance-observation" required value={observationId} onChange={e => setObservationId(e.target.value)} disabled={locked}><NativeSelectOption value="">Select an observation</NativeSelectOption>{data.observations.map(o => <NativeSelectOption key={o.observationId} value={o.observationId}>{o.memberName} · {o.memberNumber} · {o.observedDate} · {o.currency} {number(o.amountMinor)} minor units · loan {o.loanId} · observation {o.observationId}</NativeSelectOption>)}</NativeSelect></Field><Button type="submit" disabled={locked || !observationId}>Review observation</Button></FieldGroup></form>}
      </CardContent></Card>
      <section className="record-panel"><h2>Review a reported balance</h2><p>Only loans with an active linked borrower account are available. Basis and source will be visible to that borrower; check them for private information.</p>
        <PendingRequestNotice title="Publication" pending={publishing.pending} storageError={publishing.storageError} disabled={busy || refreshFailed} onRetry={() => publishing.pending && void publish(publishing.pending, false)} onDiscard={() => discard(publishing.discard)} />
        {review ? <div aria-label="Confirm reported balance"><h3>Member-visible preview and recipient</h3><p>Borrower: {review.preview.memberName} · {review.preview.memberNumber}</p><p>Account: {review.preview.userName} · {review.preview.userEmail} · link {review.preview.linkId}</p><p>Loan {review.loanId} · disbursed {review.preview.disbursementDate} · principal {review.preview.currency} {number(review.preview.principalMinor)} minor units</p><p>Balance as reported on {review.observedDate}: <strong>{review.preview.currency} {number(review.amountMinor)} minor units</strong></p><p>Basis: {review.basis} · source: {review.source}</p><p>This snapshot is not automatically recalculated. If the account link changes, this publication will not be visible to the new link.</p><Button type="button" disabled={locked} onClick={() => void publish(review, true)}>Publish reported balance</Button>{' '}<Button type="button" disabled={locked} onClick={() => setReview(null)}>Edit</Button></div> : <form onSubmit={prepare} style={{ display: 'grid', gap: 12, maxWidth: 700 }}>
          <label>Loan <NativeSelect required value={loanId} onChange={e => setLoanId(e.target.value)} disabled={locked}><NativeSelectOption value="">Select a linked borrower loan</NativeSelectOption>{data.loans.map(l => <NativeSelectOption key={l.id} value={l.id}>{l.memberName} · {l.memberNumber} · {l.currency} {number(l.principalMinor)} minor units · {l.disbursementDate} · {l.id}</NativeSelectOption>)}</NativeSelect></label>
          <label>Balance as-of date <DatePickerInput type="date" required value={observedDate} onChange={e => setObservedDate(e.target.value)} disabled={locked} /></label>
          <label>Reported amount (integer minor units) <Input inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={30} required value={amountMinor} onChange={e => setAmountMinor(e.target.value)} disabled={locked} /></label>
          <label>Basis <Input required maxLength={500} value={basis} onChange={e => setBasis(e.target.value)} disabled={locked} /></label>
          <label>Source <Input required maxLength={500} value={source} onChange={e => setSource(e.target.value)} disabled={locked} /></label>
          <Button disabled={locked || !loan}>Review balance</Button>
        </form>}
      </section><section className="record-panel"><h2>Publication history</h2><PendingRequestNotice title="Withdrawal" pending={withdrawing.pending} storageError={withdrawing.storageError} disabled={busy || refreshFailed} onRetry={() => withdrawing.pending && void withdraw(withdrawing.pending, false)} onDiscard={() => discard(withdrawing.discard)} />
        {data.publications.length === 0 ? <p>No loan balances have been published.</p> : <ul>{data.publications.map(p => <li key={p.id}>{p.memberName} · {p.memberNumber} · account {p.userName} ({p.userEmail}) · loan {p.loanId} · reported {p.observedDate}: {p.currency} {number(p.amountMinor)} minor units · basis: {p.basis} · source: {p.source} · {p.observationId ? `source observation ${p.observationId} · ` : 'manually entered · '}published {p.publishedAt} UTC · {p.withdrawnAt ? `withdrawn ${p.withdrawnAt} UTC` : p.active ? 'visible to the reviewed linked account' : 'not currently visible'}{!p.withdrawnAt && <Button type="button" disabled={locked} onClick={async () => { if (await confirmAction(`Withdraw the reported balance for ${p.memberName}, loan ${p.loanId}?`)) void withdraw({ publicationId: p.id, idempotencyKey: crypto.randomUUID() }, true) }}>Withdraw</Button>}</li>)}</ul>}
      </section>
    </>}
  </main></div>
}
