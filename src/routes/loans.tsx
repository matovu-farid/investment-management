import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { getSession } from '#/lib/auth.functions'
import { eligibleFulfilmentBookings } from '#/lib/fulfilment-selection'
import { listMembersFn } from '#/server/members/functions'
import { createBookingFn, createFulfilmentFn, createLoanFn, createRepaymentFn, listLendingFn } from '#/server/lending/functions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { NativeSelect } from '#/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import './loans.css'

export const Route = createFileRoute('/loans')({
  validateSearch: (search: Record<string, unknown>): { member?: string } => ({ member: typeof search.member === 'string' && search.member.length <= 128 ? search.member : undefined }),
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => {
    try { const [data, members] = await Promise.all([listLendingFn(), listMembersFn()]); return { ...data, members: members.filter(m => m.status === 'active'), available: true } }
    catch { return { loans: [], bookings: [], fulfilments: [], repayments: [], members: [], available: false } }
  },
  component: LendingPage,
})

type LoanRequest = { idempotencyKey:string; memberId:string; principalMinor:number; currency:string; disbursementDate:string; maturityDate:string; terms:string }
type BookingRequest = { idempotencyKey:string; memberId:string; requestedMinor:number; currency:string; requestedDate:string }
type FulfilmentRequest = { idempotencyKey:string; bookingId:string; amountMinor:number; fulfilmentDate:string }
type RepaymentRequest = { idempotencyKey:string; loanId:string; amountMinor:number; paymentDate:string; reference:string; notes:string }

function LendingPage() {
  const { loans, bookings, fulfilments, repayments, members, available } = Route.useLoaderData()
  const search = Route.useSearch()
  const activeLoans = loans.filter(l => !l.voidedAt)
  const eligibleBookings = eligibleFulfilmentBookings(bookings)
  const router = useRouter()
  const { userId } = Route.useRouteContext()
  const loanPending = usePendingRequest<LoanRequest>(userId, 'loan')
  const bookingPending = usePendingRequest<BookingRequest>(userId, 'booking')
  const fulfilmentPending = usePendingRequest<FulfilmentRequest>(userId, 'fulfilment')
  const repaymentPending = usePendingRequest<RepaymentRequest>(userId, 'repayment')
  const [kind, setKind] = useState<'loan' | 'booking'>('loan')
  const [memberId, setMemberId] = useState(() => members.some(m => m.id === search.member) ? search.member! : '')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('UGX')
  const [date, setDate] = useState('')
  const [maturity, setMaturity] = useState('')
  const [terms, setTerms] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [fulfilledAmount, setFulfilledAmount] = useState('')
  const [fulfilledDate, setFulfilledDate] = useState('')
  const [repaymentLoanId, setRepaymentLoanId] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState('')
  const [repaymentDate, setRepaymentDate] = useState('')
  const [repaymentReference, setRepaymentReference] = useState('')
  const [repaymentNotes, setRepaymentNotes] = useState('')
  const [repaymentReview, setRepaymentReview] = useState<{ request: RepaymentRequest; memberName: string; currency: string; disbursementDate: string } | null>(null)
  const [fulfilmentMessage, setFulfilmentMessage] = useState('')
  const [fulfilmentError, setFulfilmentError] = useState('')
  const [repaymentMessage, setRepaymentMessage] = useState('')
  const [repaymentError, setRepaymentError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [lastSavedMessage, setLastSavedMessage] = useState('')
  const unavailable = <T extends {idempotencyKey:string}>(p: ReturnType<typeof usePendingRequest<T>>) => !p.ready || !!p.storageError || !!p.pending
  async function recordLoan(payload: LoanRequest, isNew: boolean) {
    setBusy(true); setMessage(''); setError(''); setLastSavedMessage('')
    try {
      await loanPending.send(payload, data => createLoanFn({ data }), isNew)
      setLastSavedMessage('Loan recorded.')
      setValue(''); setDate(''); setMaturity(''); setTerms(''); setMessage('Loan recorded.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setMessage('Record saved, but the register could not refresh. Reload before making another change.') }
    } catch { setError('Could not confirm this loan. Check the register, then retry the saved request unchanged.') }
    finally { setBusy(false) }
  }
  async function recordBooking(payload: BookingRequest, isNew: boolean) {
    setBusy(true); setMessage(''); setError(''); setLastSavedMessage('')
    try {
      await bookingPending.send(payload, data => createBookingFn({ data }), isNew)
      setLastSavedMessage('Credit booking recorded.')
      setValue(''); setDate(''); setMessage('Credit booking recorded.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setMessage('Record saved, but the register could not refresh. Reload before making another change.') }
    } catch { setError('Could not confirm this booking. Check the register, then retry the saved request unchanged.') }
    finally { setBusy(false) }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (refreshFailed) return
    if (kind === 'loan' && !terms.trim()) { setMessage(''); setError('Enter the agreed loan terms before recording the loan.'); return }
    if (kind === 'loan') await recordLoan({idempotencyKey:crypto.randomUUID(),memberId,principalMinor:Number(value),currency,disbursementDate:date,maturityDate:maturity,terms:terms.trim()}, true)
    else await recordBooking({idempotencyKey:crypto.randomUUID(),memberId,requestedMinor:Number(value),currency,requestedDate:date}, true)
  }
  async function recordFulfilment(payload: FulfilmentRequest, isNew: boolean) {
    setBusy(true); setFulfilmentMessage(''); setFulfilmentError(''); setLastSavedMessage('')
    try {
      await fulfilmentPending.send(payload, data => createFulfilmentFn({ data }), isNew)
      setLastSavedMessage('Fulfilment recorded.')
      setBookingId(''); setFulfilledAmount(''); setFulfilledDate(''); setFulfilmentMessage('Fulfilment recorded.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setFulfilmentMessage('Fulfilment saved, but the register could not refresh. Reload before making another change.') }
    } catch { setFulfilmentError('Could not confirm fulfilment. Check the register, then retry the saved request unchanged.') }
    finally { setBusy(false) }
  }
  async function fulfil(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (refreshFailed) return; if (!eligibleBookings.some(b => b.id === bookingId)) { setFulfilmentError('Select an eligible booking before recording a fulfilment.'); return } await recordFulfilment({idempotencyKey:crypto.randomUUID(),bookingId,amountMinor:Number(fulfilledAmount),fulfilmentDate:fulfilledDate}, true)
  }
  async function recordRepayment(payload: RepaymentRequest, isNew: boolean) {
    setBusy(true); setRepaymentMessage(''); setRepaymentError(''); setLastSavedMessage('')
    try {
      await repaymentPending.send(payload, data => createRepaymentFn({ data }), isNew)
      setLastSavedMessage('Repayment recorded.')
      setRepaymentReview(null); setRepaymentAmount(''); setRepaymentDate(''); setRepaymentReference(''); setRepaymentNotes(''); setRepaymentMessage('Repayment recorded.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setRepaymentMessage('Repayment saved, but the register could not refresh. Reload before making another change.') }
    } catch { setRepaymentError('Could not confirm this repayment. Check the register, then retry the saved request unchanged.') }
    finally { setBusy(false) }
  }
  async function repay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (refreshFailed) return; setRepaymentError(''); setRepaymentMessage('')
    const loan = activeLoans.find(l => l.id === repaymentLoanId)
    if (!loan) { setRepaymentError('Select an active loan before recording a repayment.'); return }
    setRepaymentReview({ request: {idempotencyKey:crypto.randomUUID(),loanId:repaymentLoanId,amountMinor:Number(repaymentAmount),paymentDate:repaymentDate,reference:repaymentReference.trim(),notes:repaymentNotes.trim()}, memberName: loan.memberName ?? 'Member unavailable', currency: loan.currency, disbursementDate: loan.disbursementDate })
  }
  function discard(p: {discard:()=>void}, reportError = setError) {
    if (!window.confirm('Discard this pending request? It may already have been saved. Check the register first; a new submission can create a duplicate.')) return
    try { p.discard() } catch { reportError('Could not discard the pending request. Check browser storage and the register.') }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard lending"><p className="eyebrow">KANUNGU LOAN FUND</p><h1>Loans &amp; credit bookings</h1><p className="lead">Record individual loans and requests awaiting funding.</p>
    {!available ? <section className="notice" role="alert"><div><strong>Register unavailable</strong>{lastSavedMessage && <p>{lastSavedMessage} Reload the register when it is available to check the saved record before making another change.</p>}<p>You may not have access, or the register may be temporarily unavailable.</p></div></section> : <>
      {refreshFailed && <Alert variant="destructive" role="alert"><AlertDescription>The last change was saved, but this register could not refresh. Reload before recording another change.</AlertDescription></Alert>}
      <Alert className="lending-notice"><AlertDescription>Interest, repayment balances and accounting entries are not calculated here. Terms and financial rules must be confirmed before those features are enabled.</AlertDescription></Alert>
      <Card className="lending-card"><CardHeader><CardTitle><h2>New record</h2></CardTitle></CardHeader><CardContent><p><Link to="/credit-review">Review a member's credit records before recording</Link></p><div className="lending-switch"><Button type="button" variant={kind === 'loan' ? 'default' : 'outline'} aria-pressed={kind === 'loan'} onClick={() => { setKind('loan'); setMessage(''); setError('') }}>Loan</Button><Button type="button" variant={kind === 'booking' ? 'default' : 'outline'} aria-pressed={kind === 'booking'} onClick={() => { setKind('booking'); setMessage(''); setError('') }}>Credit booking</Button></div>
      <PendingRequestNotice title="Loan" pending={loanPending.pending} storageError={loanPending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (loanPending.pending) void recordLoan(loanPending.pending, false) }} onDiscard={() => discard(loanPending)} /><PendingRequestNotice title="Credit booking" pending={bookingPending.pending} storageError={bookingPending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (bookingPending.pending) void recordBooking(bookingPending.pending, false) }} onDiscard={() => discard(bookingPending)} /><form onSubmit={submit} className="lending-form"><label>Member<NativeSelect required value={memberId} onChange={e => setMemberId(e.target.value)}><option value="">Select an active member</option>{members.map(m => <option value={m.id} key={m.id}>{m.memberNumber} — {m.fullName}</option>)}</NativeSelect></label><label>{kind === 'loan' ? 'Principal' : 'Requested amount'} (minor units)<Input required type="number" min="1" step="1" max="9007199254740991" value={value} onChange={e => setValue(e.target.value)} /></label><label>Currency code<Input required minLength={3} maxLength={3} pattern="[A-Z]{3}" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></label><label>{kind === 'loan' ? 'Disbursement date' : 'Request date'}<DatePickerInput required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>{kind === 'loan' && <><label>Maturity date (optional)<DatePickerInput type="date" value={maturity} min={date} onChange={e => setMaturity(e.target.value)} /></label><label className="lending-full">Agreed terms<Textarea required maxLength={4000} value={terms} onChange={e => setTerms(e.target.value)} /></label></>}{error && <p className="error lending-full" role="alert">{error}</p>}{message && <p className="lending-full" role="status">{message}</p>}<Button className="lending-submit" disabled={busy || refreshFailed || !members.length || (kind === 'loan' ? unavailable(loanPending) : unavailable(bookingPending))}>{busy ? 'Saving…' : kind === 'loan' ? 'Record loan' : 'Record booking'}</Button></form>{!members.length && <p>Add an active member before recording a loan or booking.</p>}</CardContent></Card>
      <section className="lending-list"><h2>Loans ({loans.length})</h2><p><Link to="/loan-terms">Record and review loan term changes →</Link></p>{!loans.length ? <p>No loans recorded yet.</p> : <div className="lending-table"><Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Principal (minor units)</TableHead><TableHead>Disbursed</TableHead><TableHead>Maturity</TableHead><TableHead>Terms</TableHead><TableHead>Status</TableHead><TableHead>Record</TableHead></TableRow></TableHeader><TableBody>{loans.map(l => <TableRow key={l.id}><TableCell>{l.memberName}</TableCell><TableCell>{l.currency} {l.principalMinor.toLocaleString('en-US')}</TableCell><TableCell>{l.disbursementDate}</TableCell><TableCell>{l.maturityDate || '—'}</TableCell><TableCell>{l.terms}</TableCell><TableCell>{l.voidedAt ? `VOID · ${l.voidedAt} · ${l.voidReason}` : 'Recorded'}</TableCell><TableCell><Link to="/lending-acknowledgment" search={{kind:'disbursement',id:l.id}}>View acknowledgment</Link>{!l.voidedAt && <><br /><Link to="/loan-posting" search={{loan:l.id}}>Review accounting</Link></>}</TableCell></TableRow>)}</TableBody></Table></div>}</section>
      <Card className="lending-card"><CardHeader><CardTitle><h2>Record loan repayment</h2></CardTitle></CardHeader><CardContent><p>Record cash received against a particular loan. Allocation to interest or principal and accounting entries are not calculated here.</p><PendingRequestNotice title="Repayment" pending={repaymentPending.pending} storageError={repaymentPending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (repaymentPending.pending) void recordRepayment(repaymentPending.pending, false) }} onDiscard={() => discard(repaymentPending, setRepaymentError)} />{repaymentReview ? <section aria-label="Review repayment" className="flex flex-col gap-3"><h3>Review repayment</h3><p>Member: <strong>{repaymentReview.memberName}</strong></p><p>Loan: {repaymentReview.request.loanId} · disbursed {repaymentReview.disbursementDate}</p><p>Payment date: {repaymentReview.request.paymentDate}</p><p>Amount: {repaymentReview.currency} {repaymentReview.request.amountMinor.toLocaleString('en-US')} minor units</p><p>Reference: {repaymentReview.request.reference || 'Not recorded'}</p><p>Notes: {repaymentReview.request.notes || 'Not recorded'}</p><p>Recording this repayment does not allocate principal or interest or post an accounting entry.</p>{repaymentError && <Alert variant="destructive" role="alert"><AlertDescription>{repaymentError}</AlertDescription></Alert>}<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || refreshFailed || unavailable(repaymentPending) || !activeLoans.some(l => l.id === repaymentReview.request.loanId)} onClick={() => void recordRepayment(repaymentReview.request, true)}>{busy ? 'Saving…' : 'Confirm repayment'}</Button><Button type="button" variant="outline" disabled={busy || !!repaymentPending.pending} onClick={() => setRepaymentReview(null)}>Edit</Button></div></section> : <form className="lending-form" onSubmit={repay}><label>Loan<NativeSelect required value={repaymentLoanId} onChange={e => setRepaymentLoanId(e.target.value)}><option value="">Select a loan</option>{activeLoans.map(l => <option key={l.id} value={l.id}>{l.memberName} — {l.currency} {l.principalMinor.toLocaleString('en-US')} disbursed {l.disbursementDate} (loan {l.id.slice(0, 8)})</option>)}</NativeSelect></label><label>Repayment amount (loan currency minor units)<Input required type="number" min="1" step="1" max="9007199254740991" value={repaymentAmount} onChange={e => setRepaymentAmount(e.target.value)} /></label><label>Payment date<DatePickerInput required type="date" min={activeLoans.find(l => l.id === repaymentLoanId)?.disbursementDate} value={repaymentDate} onChange={e => setRepaymentDate(e.target.value)} /></label><label>Reference (optional)<Input maxLength={200} value={repaymentReference} onChange={e => setRepaymentReference(e.target.value)} /></label><label className="lending-full">Notes (optional)<Textarea maxLength={2000} value={repaymentNotes} onChange={e => setRepaymentNotes(e.target.value)} /></label>{repaymentError && <p className="error lending-full" role="alert">{repaymentError}</p>}{repaymentMessage && <p className="lending-full" role="status">{repaymentMessage}</p>}<Button className="lending-submit" disabled={busy || refreshFailed || !activeLoans.some(l => l.id === repaymentLoanId) || unavailable(repaymentPending)}>{busy ? 'Saving…' : 'Review repayment'}</Button></form>}</CardContent></Card>
      <section className="lending-list"><h2>Repayment history ({repayments.length})</h2>{!repayments.length ? <p>No repayments recorded yet.</p> : <div className="lending-table"><Table><TableHeader><TableRow><TableHead>Payment date</TableHead><TableHead>Loan</TableHead><TableHead>Amount (minor units)</TableHead><TableHead>Reference</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead><TableHead>Record</TableHead></TableRow></TableHeader><TableBody>{repayments.map(p => { const loan = loans.find(l => l.id === p.loanId); return <TableRow key={p.id}><TableCell>{p.paymentDate}</TableCell><TableCell>{loan?.memberName ?? '—'} · {loan?.disbursementDate ?? '—'} · {p.loanId.slice(0, 8)}</TableCell><TableCell>{loan?.currency} {p.amountMinor.toLocaleString('en-US')}</TableCell><TableCell>{p.reference || '—'}</TableCell><TableCell>{p.notes || '—'}</TableCell><TableCell>{p.voidedAt ? `VOID · ${p.voidedAt} · ${p.voidReason}` : 'Recorded'}</TableCell><TableCell><Link to="/lending-acknowledgment" search={{kind:'repayment',id:p.id}}>View acknowledgment</Link>{!p.voidedAt && !loan?.voidedAt && <><br /><Link to="/repayment-posting" search={{repayment:p.id}}>Review accounting</Link></>}</TableCell></TableRow> })}</TableBody></Table></div>}</section>
      <section className="lending-list"><h2>Credit bookings ({bookings.length})</h2><p><Link to="/booking-status">Change a booking status →</Link></p><p>Requested less recorded fulfilments is not necessarily the outstanding amount: historical fulfilments may be incomplete. Totals exclude fulfilments currently marked void and include future-dated entries. Stored status is a recorded value; hold and resume events do not change it.</p>{!bookings.length ? <p>No bookings recorded yet.</p> : <div className="lending-table"><Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Booking ID</TableHead><TableHead>Source reference</TableHead><TableHead>Notes</TableHead><TableHead>Requested (minor units)</TableHead><TableHead>Recorded fulfilments (minor units)</TableHead><TableHead>Requested less recorded fulfilments (minor units)</TableHead><TableHead>Requested date</TableHead><TableHead>Stored status</TableHead></TableRow></TableHeader><TableBody>{bookings.map(b => <TableRow key={b.id}><TableCell>{b.memberName}</TableCell><TableCell>{b.id}</TableCell><TableCell>{b.sourceRef || "—"}</TableCell><TableCell>{b.notes || "—"}</TableCell><TableCell>{b.currency} {b.requestedMinor.toLocaleString('en-US')}</TableCell><TableCell>{b.currency} {(b.fulfilledMinor ?? 0).toLocaleString('en-US')}</TableCell><TableCell>{b.currency} {(b.requestedMinor - (b.fulfilledMinor ?? 0)).toLocaleString('en-US')}</TableCell><TableCell>{b.requestedDate}</TableCell><TableCell>{b.status}</TableCell></TableRow>)}</TableBody></Table></div>}</section>
      <Card className="lending-card"><CardHeader><CardTitle><h2>Record booking fulfilment</h2></CardTitle></CardHeader><CardContent><p>This records an amount fulfilled; it does not disburse a loan or post accounting entries. Check the source record and fulfilment history first: requested less recorded fulfilments may overstate what is outstanding when history is incomplete.</p><PendingRequestNotice title="Booking fulfilment" pending={fulfilmentPending.pending} storageError={fulfilmentPending.storageError} disabled={busy || refreshFailed} onRetry={() => { if (fulfilmentPending.pending) void recordFulfilment(fulfilmentPending.pending, false) }} onDiscard={() => discard(fulfilmentPending, setFulfilmentError)} /><form className="lending-form" onSubmit={fulfil}><label>Booking<NativeSelect required value={bookingId} onChange={e => setBookingId(e.target.value)}><option value="">Select a booking</option>{eligibleBookings.map(b => <option key={b.id} value={b.id}>{b.memberName} — requested {b.requestedDate} · booking {b.id} · source {b.sourceRef || "not recorded"} · {b.currency} {(b.requestedMinor - (b.fulfilledMinor ?? 0)).toLocaleString('en-US')} requested less recorded fulfilments (minor units)</option>)}</NativeSelect></label><label>Amount fulfilled (minor units)<Input required type="number" min="1" step="1" max="9007199254740991" value={fulfilledAmount} onChange={e => setFulfilledAmount(e.target.value)} /></label><label>Date<DatePickerInput required type="date" min={eligibleBookings.find(b => b.id === bookingId)?.requestedDate} value={fulfilledDate} onChange={e => setFulfilledDate(e.target.value)} /></label>{fulfilmentError && <p className="error lending-full" role="alert">{fulfilmentError}</p>}{fulfilmentMessage && <p className="lending-full" role="status">{fulfilmentMessage}</p>}<Button className="lending-submit" disabled={busy || refreshFailed || !eligibleBookings.some(b => b.id === bookingId) || unavailable(fulfilmentPending)}>{busy ? 'Saving…' : 'Record fulfilment'}</Button></form></CardContent></Card>
      <section className="lending-list"><h2>Fulfilment history ({fulfilments.length})</h2>{!fulfilments.length ? <p>No fulfilments recorded yet.</p> : <div className="lending-table"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Booking ID</TableHead><TableHead>Booking source reference</TableHead><TableHead>Fulfilment ID</TableHead><TableHead>Fulfilment source reference</TableHead><TableHead>Amount (minor units)</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{fulfilments.map(f => { const b = bookings.find(item => item.id === f.bookingId); return <TableRow key={f.id}><TableCell>{f.fulfilmentDate}</TableCell><TableCell>{b?.memberName ?? '—'}</TableCell><TableCell>{f.bookingId}</TableCell><TableCell>{f.bookingSourceRef || '—'}</TableCell><TableCell>{f.id}</TableCell><TableCell>{f.sourceRef || '—'}</TableCell><TableCell>{b?.currency} {f.amountMinor.toLocaleString('en-US')}</TableCell><TableCell>{f.voidedAt ? `Voided ${f.voidedAt} UTC — ${f.voidReason}` : 'Recorded'}</TableCell></TableRow> })}</TableBody></Table></div>}</section>
    </>}</main></div>
}
