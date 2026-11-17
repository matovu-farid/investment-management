import { SpinnerLabel } from '#/components/ui/spinner'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Input } from '#/components/ui/input'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { useState } from 'react'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listInvestmentCorrectionWorkFn, postInvestmentCorrectionFn, reverseInvestmentCorrectionFn } from '#/server/investment-corrections/functions'

type Work = Awaited<ReturnType<typeof listInvestmentCorrectionWorkFn>>
type Version = Work['versions'][number]
type Request = { idempotencyKey: string; transactionId: string; predecessorReversalId: string; date: string; expectedInvestmentId: string; expectedDate: string; expectedType: string; expectedAmountMinor: number; expectedCurrency: string; debitAccountId: string; creditAccountId: string }

export function InvestmentCorrections({ data, userId, refresh }: { data: Work; userId: string; refresh: () => Promise<unknown> }) {
  const [versionId, setVersionId] = useState(''), [date, setDate] = useState(''), [debit, setDebit] = useState(''), [credit, setCredit] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const pending = usePendingRequest<Request>(userId, 'investment-journal-correction')
  const version = data.versions.find(v => v.journalId === versionId)
  const accounts = data.accounts.filter(a => a.currency === version?.currency)
  const label = (id: string) => { const a = data.accounts.find(x => x.id === id); return a ? `${a.code} — ${a.name}` : id }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (!version?.reversalId || !version.reversalDate || version.hasSuccessor || !date || date < version.reversalDate || debit === credit || !accounts.some(a => a.id === debit) || !accounts.some(a => a.id === credit)) { setError('Select a reversed journal, a valid date and two different accounts in the transaction currency.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), transactionId: version.transactionId, predecessorReversalId: version.reversalId, date, expectedInvestmentId: version.investmentId, expectedDate: version.transactionDate, expectedType: version.transactionType, expectedAmountMinor: version.amountMinor, expectedCurrency: version.currency, debitAccountId: debit, creditAccountId: credit })
  }
  async function send(v: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let status = ''
      await pending.send(v, async ({ idempotencyKey, ...rest }) => { const result = await postInvestmentCorrectionFn({ data: { ...rest, requestKey: idempotencyKey } }); status = result.active ? 'Replacement journal posted.' : `The replacement was previously posted${result.reversalId ? ' and subsequently reversed' : ''}${result.sourceVoidedAt ? '; its source was subsequently voided' : ''}. Inspect the history.` }, isNew)
      setReview(null); setVersionId(''); setDate(''); setDebit(''); setCredit('')
      setMessage(status)
      try { await refresh() } catch { setError('Saved, but the list could not refresh. Reload before continuing.') }
    } catch { setError('Posting was not confirmed. Check journal history before retrying the retained request unchanged.') }
    finally { setBusy(false) }
  }
  return <>
    <section className="record-panel"><h2>Correct a reversed investment journal</h2><p>Post a replacement against the same transaction after reversing its previous journal. Choose the approved accounts and a replacement date on or after the reversal date.</p>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Investment replacement" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={async () => { if (await confirmAction('This request may have posted. Check journal history before discarding it. Discard the request?')) pending.discard() }} />
      {review ? <section role="region" aria-label="Review investment replacement"><h3>Review replacement</h3><p>{version?.investmentName} · {review.expectedType} · source {review.transactionId} · reversal {review.predecessorReversalId}</p><p>Replacement date: {review.date}</p><p>Debit {label(review.debitAccountId)}: {review.expectedCurrency} {review.expectedAmountMinor.toLocaleString('en-US')} minor units</p><p>Credit {label(review.creditAccountId)}: {review.expectedCurrency} {review.expectedAmountMinor.toLocaleString('en-US')} minor units</p><Button type="button" disabled={busy || !pending.ready || !!pending.pending || !!pending.storageError} onClick={() => void send(review, true)}>{busy ? <SpinnerLabel>Post replacement</SpinnerLabel> : 'Post replacement'}</Button> <Button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</Button></section>
        : <form onSubmit={prepare} className="grid w-full max-w-[620px] gap-4"><label className="flex flex-col gap-2">Reversed journal<NativeSelect required value={versionId} onChange={e => { setVersionId(e.target.value); setDate(''); setDebit(''); setCredit('') }}><NativeSelectOption value="">Select a reversed journal</NativeSelectOption>{data.versions.filter(v => v.reversalId && !v.hasSuccessor).map(v => <NativeSelectOption key={v.journalId} value={v.journalId}>{v.investmentName} · {v.transactionType} · {v.currency} {v.amountMinor.toLocaleString('en-US')} · reversal {v.reversalDate} · {v.journalId.slice(0, 8)}</NativeSelectOption>)}</NativeSelect></label>{version && <><p>Transaction {version.transactionId} · prior journal {version.journalId} · reversal effective {version.reversalDate}</p><label className="flex flex-col gap-2">Replacement date<DatePickerInput type="date" required min={version.reversalDate ?? undefined} value={date} onChange={e => setDate(e.target.value)} /></label><label className="flex flex-col gap-2">Replacement debit account<NativeSelect required value={debit} onChange={e => setDebit(e.target.value)}><NativeSelectOption value="">Select account</NativeSelectOption>{accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</NativeSelectOption>)}</NativeSelect></label><label className="flex flex-col gap-2">Replacement credit account<NativeSelect required value={credit} onChange={e => setCredit(e.target.value)}><NativeSelectOption value="">Select account</NativeSelectOption>{accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</NativeSelectOption>)}</NativeSelect></label></>}<Button disabled={busy || !version || !pending.ready || !!pending.pending || !!pending.storageError}>Review replacement</Button></form>}
    </section>
    <section className="record-panel"><h2>Investment journal history</h2><p>Reversals and replacements affect reports on and after their effective dates. Status is shown as of {data.asOfDate} in Kampala.</p>{data.versions.length === 0 ? <p>No investment journals recorded.</p> : <ul>{data.versions.map(v => <li key={v.journalId}>{v.investmentName} · {v.transactionType} · transaction {v.transactionId} · {v.isCorrection ? 'replacement' : 'original'} journal {v.journalId} · effective {v.journalDate} · {v.reversalId ? `${v.reversalDate && v.reversalDate > data.asOfDate ? 'reversal scheduled' : 'reversed'} ${v.reversalDate} by ${v.reversalId}` : 'not reversed'}{v.isCorrection === 1 && !v.reversalId && <ReverseReplacement version={v} lines={data.lines.filter(l => l.entryId === v.journalId)} refresh={refresh} />}</li>)}</ul>}</section>
  </>
}

function ReverseReplacement({ version, lines, refresh }: { version: Version; lines: Work['lines']; refresh: () => Promise<unknown> }) {
  const [date, setDate] = useState(''), [reason, setReason] = useState(''), [review, setReview] = useState<{ date: string; reason: string } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function send() { if (!review) return; setBusy(true); setMessage(''); try { await reverseInvestmentCorrectionFn({ data: { journalId: version.journalId, date: review.date, reason: review.reason } }); setReview(null); setMessage('Replacement reversal posted.'); try { await refresh() } catch { setMessage('Reversal posted, but refresh failed. Reload to inspect it.') } } catch { setMessage('Reversal not confirmed. Inspect history before retrying with the same date and reason.') } finally { setBusy(false) } }
  return <details><summary>Reverse replacement</summary><p>This posts the exact opposite lines and retains the transaction and journal.</p>{review ? <section role="region" aria-label="Review replacement reversal"><p>Reversal date: {review.date} · Reason: {review.reason}</p><ul>{lines.map((l, i) => <li key={i}>{l.side === 'debit' ? 'Credit' : 'Debit'} {l.accountCode} — {l.accountName}: {version.currency} {l.amountMinor.toLocaleString('en-US')} minor units</li>)}</ul><Button type="button" disabled={busy} onClick={() => void send()}>Post replacement reversal</Button> <Button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</Button></section> : <form onSubmit={e => { e.preventDefault(); if (lines.length !== 2 || !reason.trim()) { setMessage('Journal lines or reason unavailable. Reload and check the details.'); return } setMessage(''); setReview({ date, reason: reason.trim() }) }} className="grid w-full max-w-[500px] gap-3"><label className="flex flex-col gap-2">Replacement reversal date<DatePickerInput type="date" required min={version.journalDate} value={date} onChange={e => setDate(e.target.value)} /></label><label className="flex flex-col gap-2">Replacement reversal reason<Input required maxLength={450} value={reason} onChange={e => setReason(e.target.value)} /></label><Button disabled={busy}>Review replacement reversal</Button></form>}{message && <p role="status">{message}</p>}</details>
}
