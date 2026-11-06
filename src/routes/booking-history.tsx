import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { addStatusEventFn, listBookingHistoryFn } from '#/server/booking-history/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'

export const Route = createFileRoute('/booking-history')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => { try { return { data: await listBookingHistoryFn(), available: true } } catch { return { data: null, available: false } } },
  pendingComponent: () => <main className="dashboard" role="status">Loading booking history…</main>,
  component: BookingHistory,
})

type EventRequest = { idempotencyKey: string; bookingId: string; eventType: 'held' | 'resumed'; eventDate: string; reason: string }
function BookingHistory() {
  const { data, available } = Route.useLoaderData(), router = useRouter(), { userId } = Route.useRouteContext()
  const pending = usePendingRequest<EventRequest>(userId, 'booking-history-status-event')
  const [bookingId, setBookingId] = useState(''), [eventType, setEventType] = useState<'held' | 'resumed'>('held'), [eventDate, setEventDate] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const booking = data?.bookings.find(b => b.id === bookingId)
  const label = (id: string) => { const b = data?.bookings.find(item => item.id === id); return b ? `${b.memberName} · ${b.currency} ${b.requestedMinor.toLocaleString('en-US')} minor units · requested ${b.requestedDate} · ${b.id.slice(0, 8)}` : id }
  async function send(payload: EventRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(payload, v => addStatusEventFn({ data: { bookingId: v.bookingId, eventType: v.eventType, eventDate: v.eventDate, reason: v.reason, requestKey: v.idempotencyKey } }), isNew)
      setReason(''); setMessage('Booking event recorded.')
      try { await router.invalidate() } catch { setMessage('Booking event recorded, but the list could not refresh. Reload to see it.') }
    } catch { setError('The event was not confirmed. Check the history, then retry the retained request unchanged if the outcome is uncertain.') } finally { setBusy(false) }
  }
  async function submit(e: React.FormEvent) { e.preventDefault(); await send({ idempotencyKey: crypto.randomUUID(), bookingId, eventType, eventDate, reason }, true) }
  function discard() { try { pending.discard(); setDiscardReview(false) } catch { setError('Could not discard the pending request in this tab.') } }

  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header>
    <main className="dashboard flex flex-col gap-6">
      <div><p className="eyebrow">ADMINISTRATION</p><h1>Credit booking history</h1><p className="lead">Record when a booking was held or resumed.</p></div>
      {!available || !data ? <Alert variant="destructive" role="alert"><AlertDescription>Booking history is unavailable or you do not have permission.</AlertDescription></Alert> : <>
        <Alert><AlertDescription>These are recorded events. They do not change the booking’s existing status, allocate funds or disburse a loan. Review the history alongside the status in the booking register. <Link to="/booking-status">Change the current booking status</Link> when authorised.</AlertDescription></Alert>
        {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle>Record an event</CardTitle><CardDescription>Choose the booking and record its hold or resume history.</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">
          <PendingRequestNotice title="Booking event" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={() => setDiscardReview(true)} />
          {discardReview && <Alert role="region" aria-label="Confirm discard"><AlertDescription className="flex flex-col gap-3"><p>The pending request may already have been recorded. Check the history before discarding it; a new submission could create a duplicate.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={discard}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</Button></div></AlertDescription></Alert>}
          <form onSubmit={submit} className="max-w-xl"><FieldGroup>
            <Field><FieldLabel htmlFor="history-booking">Booking</FieldLabel><NativeSelect id="history-booking" required value={bookingId} onChange={e => setBookingId(e.target.value)}><option value="">Select a booking</option>{data.bookings.map(b => <option key={b.id} value={b.id}>{label(b.id)} · status {b.status}</option>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="history-event">Event</FieldLabel><NativeSelect id="history-event" value={eventType} onChange={e => setEventType(e.target.value as 'held' | 'resumed')}><option value="held">Held</option><option value="resumed">Resumed</option></NativeSelect></Field>
            <Field><FieldLabel htmlFor="history-date">Event date</FieldLabel><DatePickerInput id="history-date" type="date" required min={booking?.requestedDate} value={eventDate} onChange={e => setEventDate(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="history-reason">Reason</FieldLabel><Textarea id="history-reason" required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <Button disabled={busy || !data.bookings.length || !pending.ready || !!pending.pending || !!pending.storageError}>{busy ? 'Saving…' : 'Record event'}</Button>
          </FieldGroup></form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recorded events ({data.events.length})</CardTitle><CardDescription>Recorded hold and resume events; the booking’s stored status is shown in the register.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{data.events.length === 0 ? <p>No hold or resume events recorded.</p> : data.events.map(item => <article key={item.id} className="rounded-md border p-4"><h3>{label(item.bookingId)}</h3><p>{item.eventDate} · <Badge variant="secondary">{item.eventType}</Badge></p><p>{item.reason}</p><p>Recorded by {item.createdBy} at {item.createdAt}</p></article>)}</CardContent></Card>
      </>}
    </main>
  </div>
}
