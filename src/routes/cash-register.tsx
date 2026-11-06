import { Alert, AlertDescription } from '#/components/ui/alert'
import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listCashEntriesFn, recordCashEntryFn, voidCashEntryFn } from '#/server/cash/functions'
import './cash-register.css'

export const Route = createFileRoute('/cash-register')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  component: CashRegister,
})

type RecordRequest = { idempotencyKey: string; entryDate: string; direction: 'receipt' | 'payment'; amountMinor: string; currency: string; counterparty: string; reference: string; description: string }
type VoidRequest = { idempotencyKey: string; entryId: string; reason: string }
type Register = Awaited<ReturnType<typeof listCashEntriesFn>>
type Entry = Register['entries'][number]
const amount = (value: string) => BigInt(value).toLocaleString('en-US')
const entryLabel = (entry: Entry) => `${entry.entryDate} · ${entry.direction} · ${entry.currency} ${amount(entry.amountMinor)} minor units · ${entry.description} · ${entry.id}`

function CashRegister() {
  const { userId } = Route.useRouteContext()
  const recording = usePendingRequest<RecordRequest>(userId, 'cash-entry')
  const voiding = usePendingRequest<VoidRequest>(userId, 'cash-entry-void')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null), [register, setRegister] = useState<Register | null>(null)
  const [entryDate, setEntryDate] = useState(''), [direction, setDirection] = useState<'receipt' | 'payment'>('payment')
  const [amountMinor, setAmountMinor] = useState(''), [currency, setCurrency] = useState('UGX'), [counterparty, setCounterparty] = useState(''), [reference, setReference] = useState(''), [description, setDescription] = useState('')
  const [entryId, setEntryId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<RecordRequest | null>(null), [voidReview, setVoidReview] = useState<VoidRequest | null>(null)
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const locked = busy || refreshFailed || !recording.ready || !voiding.ready || !!recording.pending || !!voiding.pending || !!recording.storageError || !!voiding.storageError
  const selectedVoid = register?.entries.find(e => e.id === entryId)
  async function loadRange(range: { from: string; to: string }) {
    const result = await listCashEntriesFn({ data: range }); setRegister(result); setPeriod(range); setEntryId(''); setVoidReview(null)
  }
  async function load(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true); setRegister(null); setPeriod(null)
    try { await loadRange({ from, to }) } catch { setError('The register is unavailable. Check the period and your access, then try again.') } finally { setBusy(false) }
  }
  async function refresh() {
    if (!period) return
    try { await loadRange(period) } catch { setRefreshFailed(true); setRegister(null); setError('The change was saved, but the register could not refresh. Reload before making another change.') }
  }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check the register before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!entryDate || !/^[1-9][0-9]{0,29}$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency) || !description.trim()) { setError('Enter a date, description, positive whole amount in minor units and three-letter currency.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), entryDate, direction, amountMinor, currency, counterparty: counterparty.trim(), reference: reference.trim(), description: description.trim() })
  }
  async function record(request: RecordRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await recording.send(request, async p => { const { idempotencyKey, ...details } = p; const result = await recordCashEntryFn({ data: { ...details, requestKey: idempotencyKey } }); active = result.active }, isNew)
      setReview(null); setEntryDate(''); setAmountMinor(''); setCurrency('UGX'); setCounterparty(''); setReference(''); setDescription('')
      setMessage(active ? 'Cash record saved.' : 'This request was recorded earlier and the record is now void.'); await refresh()
    } catch { setError('The record could not be confirmed. Check the register, then retry the retained request unchanged if its outcome is uncertain.') } finally { setBusy(false) }
  }
  function prepareVoid(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!selectedVoid || selectedVoid.voidedAt || !reason.trim()) { setError('Select an active record and enter a reason.'); return }
    setVoidReview({ idempotencyKey: crypto.randomUUID(), entryId: selectedVoid.id, reason: reason.trim() })
  }
  async function voidRecord(request: VoidRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await voiding.send(request, p => voidCashEntryFn({ data: { requestKey: p.idempotencyKey, entryId: p.entryId, reason: p.reason } }), isNew); setVoidReview(null); setEntryId(''); setReason(''); setMessage('Record marked void; its history remains visible.'); await refresh() }
    catch { setError('The void could not be confirmed. Check the register, then retry the retained request unchanged if its outcome is uncertain.') } finally { setBusy(false) }
  }
  const totals = new Map<string, { receipt: bigint; payment: bigint }>()
  for (const item of register?.entries ?? []) if (!item.voidedAt) { const current = totals.get(item.currency) ?? { receipt: 0n, payment: 0n }; current[item.direction] += BigInt(item.amountMinor); totals.set(item.currency, current) }
  return <div className="app cash-register"><header className="cash-screen"><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Other cash receipts and payments</h1><p><Link to="/cash-posting">Post recorded cash activity to the ledger →</Link></p>
    <p>Record ordinary cash receipts and payments that are not already recorded as investment or loan transactions. These are entered facts; they do not post to the ledger or verify cash movement. Do not add this register to other reports without checking for overlap.</p>
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <p role="status">{message}</p>}
    <div className="cash-screen"><PendingRequestNotice title="Cash record" pending={recording.pending} storageError={recording.storageError} disabled={busy || refreshFailed} onRetry={() => recording.pending && void record(recording.pending, false)} onDiscard={() => discard(recording.discard)} />
    <PendingRequestNotice title="Cash record void" pending={voiding.pending} storageError={voiding.storageError} disabled={busy || refreshFailed} onRetry={() => voiding.pending && void voidRecord(voiding.pending, false)} onDiscard={() => discard(voiding.discard)} />
    <Card className="cash-panel"><CardHeader><CardTitle role="heading" aria-level={2}>Record a receipt or payment</CardTitle></CardHeader><CardContent>{review ? <div aria-label="Review cash record"><h3>Review the record</h3><p>{review.entryDate} · {review.direction} · {review.currency} {amount(review.amountMinor)} minor units</p><p>Counterparty: {review.counterparty || 'Not recorded'} · Reference: {review.reference || 'Not recorded'}</p><p>Description: {review.description}</p><Button type="button" disabled={locked} onClick={() => void record(review, true)}>{busy ? 'Saving…' : 'Confirm record'}</Button>{' '}<Button type="button" disabled={busy} onClick={() => setReview(null)}>Edit</Button></div> : <form onSubmit={prepare} style={{ maxWidth: 680 }}><FieldGroup>
      <Field><FieldLabel htmlFor="entry-date">Date</FieldLabel><DatePickerInput id="entry-date" required type="date" value={entryDate} disabled={locked} onChange={e => setEntryDate(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="entry-direction">Direction</FieldLabel><NativeSelect id="entry-direction" value={direction} disabled={locked} onChange={e => setDirection(e.target.value as 'receipt' | 'payment')}><NativeSelectOption value="receipt">Receipt</NativeSelectOption><NativeSelectOption value="payment">Payment</NativeSelectOption></NativeSelect></Field>
      <Field><FieldLabel htmlFor="entry-amount">Amount (integer minor units)</FieldLabel><Input id="entry-amount" required inputMode="numeric" pattern="[1-9][0-9]*" maxLength={30} value={amountMinor} disabled={locked} onChange={e => setAmountMinor(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="entry-currency">Currency (three-letter code)</FieldLabel><Input id="entry-currency" required pattern="[A-Z]{3}" maxLength={3} value={currency} disabled={locked} onChange={e => setCurrency(e.target.value.toUpperCase())} /></Field>
      <Field><FieldLabel htmlFor="entry-counterparty">Counterparty (optional)</FieldLabel><Input id="entry-counterparty" maxLength={200} value={counterparty} disabled={locked} onChange={e => setCounterparty(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="entry-reference">Reference (optional)</FieldLabel><Input id="entry-reference" maxLength={200} value={reference} disabled={locked} onChange={e => setReference(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="entry-description">Description</FieldLabel><Textarea id="entry-description" required maxLength={450} value={description} disabled={locked} onChange={e => setDescription(e.target.value)} /></Field>
      <Button disabled={locked}>Review record</Button></FieldGroup></form>}</CardContent></Card>
    <Card className="cash-panel"><CardHeader><CardTitle role="heading" aria-level={2}>Select a reporting period</CardTitle></CardHeader><CardContent><form onSubmit={load} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}><Field><FieldLabel htmlFor="period-from">From</FieldLabel><DatePickerInput id="period-from" type="date" required value={from} onChange={e => setFrom(e.target.value)} /></Field><Field><FieldLabel htmlFor="period-to">To</FieldLabel><DatePickerInput id="period-to" type="date" min={from || undefined} required value={to} onChange={e => setTo(e.target.value)} /></Field><Button disabled={busy}>View period</Button></form></CardContent></Card></div>
    {register && period && <Card className="cash-panel"><CardHeader><CardTitle role="heading" aria-level={2}>Recorded cash activity: {period.from} to {period.to}</CardTitle></CardHeader><CardContent><p>Totals include active entries in this register only; void records are excluded. They are not a complete cash-flow statement or verified bank balance.</p><Button className="cash-screen" type="button" onClick={() => window.print()}>Print period view</Button>
      {totals.size ? <ul>{Array.from(totals, ([code, value]) => <li key={code}>{code}: receipts {value.receipt.toLocaleString('en-US')} · payments {value.payment.toLocaleString('en-US')} minor units</li>)}</ul> : <p>No active records in this period.</p>}
      {register.entries.length > 0 && <div style={{ overflowX: 'auto' }}><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Direction</TableHead><TableHead>Amount (minor units)</TableHead><TableHead>Counterparty / reference</TableHead><TableHead>Description</TableHead><TableHead>Status and history</TableHead></TableRow></TableHeader><TableBody>{register.entries.map(entry => <TableRow key={entry.id}><TableCell>{entry.entryDate}</TableCell><TableCell>{entry.direction}</TableCell><TableCell>{entry.currency} {amount(entry.amountMinor)}</TableCell><TableCell>{entry.counterparty || 'Not recorded'}<br />{entry.reference || 'Not recorded'}</TableCell><TableCell>{entry.description}</TableCell><TableCell>{entry.voidedAt ? `VOID ${entry.voidedAt} UTC by ${entry.voidedBy} · ${entry.voidReason}` : 'Active'}<br />Recorded {entry.createdAt} UTC by {entry.createdBy}<br />ID {entry.id}</TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>}
    {register && <Card className="cash-screen cash-panel"><CardHeader><CardTitle role="heading" aria-level={2}>Void an erroneous record</CardTitle></CardHeader><CardContent><p>Voiding preserves history, excludes the record from these totals and does not reverse a journal entry.</p>{voidReview ? <div aria-label="Review void"><p>{selectedVoid ? entryLabel(selectedVoid) : voidReview.entryId}</p><p>Reason: {voidReview.reason}</p><Button type="button" disabled={locked} onClick={() => void voidRecord(voidReview, true)}>{busy ? 'Saving…' : 'Confirm void'}</Button>{' '}<Button type="button" disabled={busy} onClick={() => setVoidReview(null)}>Edit</Button></div> : <form onSubmit={prepareVoid} style={{ maxWidth: 680 }}><FieldGroup><Field><FieldLabel htmlFor="void-entry">Record</FieldLabel><NativeSelect id="void-entry" required value={entryId} disabled={locked} onChange={e => setEntryId(e.target.value)}><NativeSelectOption value="">Select an active record</NativeSelectOption>{register.entries.filter(e => !e.voidedAt).map(e => <NativeSelectOption key={e.id} value={e.id}>{entryLabel(e)}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="void-reason">Reason</FieldLabel><Textarea id="void-reason" required maxLength={450} value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></Field><Button disabled={locked || !entryId}>Review void</Button></FieldGroup></form>}</CardContent></Card>}
  </main></div>
}
