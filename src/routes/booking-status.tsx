import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listBookingStatusesFn, changeBookingStatusFn } from '#/server/booking-status/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import { Badge } from '#/components/ui/badge'
import './lending-detail-nav.css'

export const Route = createFileRoute('/booking-status')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => listBookingStatusesFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: BookingStatus,
})

type Status = 'waiting' | 'held' | 'closed' | 'cancelled'
type Data = NonNullable<Awaited<ReturnType<typeof listBookingStatusesFn>>>
type Booking = Data['bookings'][number]
type Request = { bookingId: string; expectedStatus: Status; expectedRevision: number; expectedMemberId: string; expectedMemberNumber: string; expectedMemberName: string; expectedRequestedMinor: number; expectedCurrency: string; expectedRequestedDate: string; newStatus: Status; reason: string; idempotencyKey: string }
const label = (b: Booking) => `${b.memberName} · ${b.memberNumber} · ${b.currency} ${Number(b.requestedMinor).toLocaleString('en-US')} minor units · ${b.requestedDate} · ${b.status} · booking ${b.id}${b.sourceRef ? ` · source ${b.sourceRef}` : ''}`

function BookingStatus() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'booking-current-status')
  const [bookingId, setBookingId] = useState(''), [nextStatus, setNextStatus] = useState<Status>('waiting'), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [discardReview, setDiscardReview] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  const booking = data?.bookings.find(b => b.id === bookingId)
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  function selectBooking(id: string) {
    setBookingId(id); const selected = data?.bookings.find(b => b.id === id)
    setNextStatus((selected?.status as Status) ?? 'waiting'); setReason(''); setReview(null); setError(''); setMessage('')
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!booking || !reason.trim()) { setError('Select a booking and enter a reason.'); return }
    if (booking.status === nextStatus) { setError('Choose a different status.'); return }
    setReview({ bookingId: booking.id, expectedStatus: booking.status as Status, expectedRevision: booking.revision, expectedMemberId: booking.memberId, expectedMemberNumber: booking.memberNumber, expectedMemberName: booking.memberName, expectedRequestedMinor: booking.requestedMinor, expectedCurrency: booking.currency, expectedRequestedDate: booking.requestedDate, newStatus: nextStatus, reason: reason.trim(), idempotencyKey: crypto.randomUUID() })
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let result: { currentStatus: string; currentRevision: number } | null = null
      await pending.send(request, async p => { result = await changeBookingStatusFn({ data: { bookingId: p.bookingId, expectedStatus: p.expectedStatus, expectedRevision: p.expectedRevision, expectedMemberId: p.expectedMemberId, expectedMemberNumber: p.expectedMemberNumber, expectedMemberName: p.expectedMemberName, expectedRequestedMinor: p.expectedRequestedMinor, expectedCurrency: p.expectedCurrency, expectedRequestedDate: p.expectedRequestedDate, newStatus: p.newStatus, reason: p.reason, requestKey: p.idempotencyKey } }) }, isNew)
      setReview(null); setBookingId(''); setReason(''); setMessage(result ? `Status change recorded. Current recorded status: ${(result as {currentStatus:string;currentRevision:number}).currentStatus} (revision ${(result as {currentStatus:string;currentRevision:number}).currentRevision}).` : 'Status change confirmed.')
      try { await router.invalidate() } catch { setRefreshFailed(true); setError('The change was recorded, but the list could not refresh. Reload before making another change.') }
    } catch { setError('The change could not be confirmed. Check the history and current booking; if details changed after review, discard the retained request and review again. Otherwise retry it unchanged.') }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans and credit bookings</Link></header><main className="dashboard">
    <p className="eyebrow">LENDING / BOOKING STATUS</p><h1>Change credit booking status</h1><p>Record the current status explicitly with a reason. A confirmed change takes effect immediately and is retained in the change history. It may change which bookings are available for recording new fulfilments.</p>
    <Alert className="mt-6"><AlertDescription>Choose the status based on the organisation’s decision. This does not approve credit, allocate funds, create a loan or infer queue priority. Earlier <Link to="/booking-history">hold and resume events</Link> are separate records and do not automatically change this status. The history records when changes were entered; it does not reconstruct historical statuses.</AlertDescription></Alert>
    {!data ? <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>Booking statuses are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>{error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert className="mt-6" role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <nav className="lending-detail-nav" aria-label="Booking status sections"><a href="#booking-status-change">Review a status change</a><a href="#booking-status-history">Status change history</a><Link to="/booking-history">Hold and resume events</Link></nav>
      <PendingRequestNotice title="Booking status change" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <Card className="mt-6" aria-label="Confirm discarding request"><CardHeader><CardTitle>Discard pending request?</CardTitle><CardDescription>The request may already have been recorded. Check the status and change history before discarding it.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><Button type="button" variant="destructive" disabled={busy} onClick={() => { try { pending.discard(); setDiscardReview(false) } catch { setError('The pending request could not be discarded.') } }}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</Button></CardContent></Card>}
      <Card id="booking-status-change" className="mt-6"><CardHeader><CardTitle>Review a status change</CardTitle><CardDescription>Choose a booking and record the reason for its new status.</CardDescription></CardHeader><CardContent>{review ? <div aria-label="Confirm booking status change" className="flex flex-col gap-3"><p><strong>{review.expectedMemberName} · {review.expectedMemberNumber}</strong></p><p>Booking {review.bookingId} · requested {review.expectedRequestedDate} · {review.expectedCurrency} {Number(review.expectedRequestedMinor).toLocaleString('en-US')} minor units · revision {review.expectedRevision}</p><p>Current status: <Badge variant="secondary">{review.expectedStatus}</Badge> → New status: <Badge>{review.newStatus}</Badge></p><p>Reason: {review.reason}</p><p>The new status takes effect immediately when recorded.</p><div className="flex flex-wrap gap-3"><Button type="button" disabled={locked} onClick={() => void send(review, true)}>{busy ? <SpinnerLabel>Confirm status change</SpinnerLabel> : 'Confirm status change'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div></div> : <form onSubmit={prepare} className="max-w-2xl"><FieldGroup><Field><FieldLabel htmlFor="booking-status-booking">Booking</FieldLabel><NativeSelect id="booking-status-booking" required value={bookingId} disabled={locked} onChange={e => selectBooking(e.target.value)}><NativeSelectOption value="">Select a booking</NativeSelectOption>{data.bookings.map(b => <NativeSelectOption key={b.id} value={b.id}>{label(b)}</NativeSelectOption>)}</NativeSelect></Field>{booking && <><Field><FieldLabel htmlFor="booking-status-new">New status</FieldLabel><NativeSelect id="booking-status-new" value={nextStatus} disabled={locked} onChange={e => setNextStatus(e.target.value as Status)}><NativeSelectOption value="waiting">Waiting</NativeSelectOption><NativeSelectOption value="held">Held</NativeSelectOption><NativeSelectOption value="closed">Closed</NativeSelectOption><NativeSelectOption value="cancelled">Cancelled</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="booking-status-reason">Reason</FieldLabel><Textarea id="booking-status-reason" required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></Field></>}<Button disabled={locked || !booking}>Review status change</Button></FieldGroup></form>}</CardContent></Card>
      <Card id="booking-status-history" className="mt-6"><CardHeader><CardTitle>Status change history</CardTitle><CardDescription>Changes are shown in their recorded order.</CardDescription></CardHeader><CardContent>{!data.changes.length ? <p>No status changes recorded.</p> : <ul className="flex flex-col gap-3">{data.changes.map(c => <li key={c.id}>Booking {c.bookingId} · {c.oldStatus} → {c.newStatus} · {c.reason} · recorded {c.createdAt} UTC by {c.createdBy} · revision {c.revision}</li>)}</ul>}</CardContent></Card>
    </>}
  </main></div>
}
