import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { useState } from 'react'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listInvestmentCorrectionWorkFn, postInvestmentCorrectionFn, reverseInvestmentCorrectionFn } from '#/server/investment-corrections/functions'

type Work = Awaited<ReturnType<typeof listInvestmentCorrectionWorkFn>>
type Version = Work['versions'][number]
type Request = { idempotencyKey: string; transactionId: string; predecessorReversalId: string; date: string; expectedInvestmentId: string; expectedDate: string; expectedType: string; expectedAmountMinor: number; expectedCurrency: string; debitAccountId: string; creditAccountId: string }
const panel = { background: 'white', border: '1px solid #e2e9e2', borderRadius: 7, padding: 24, marginTop: 24 }
const field = { width: '100%', padding: 12, marginTop: 8, border: '1px solid #ccd6cd', borderRadius: 5, background: 'white' }

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
    <section style={panel}><h2>Correct a reversed investment journal</h2><p>Post a replacement against the same transaction after reversing its previous journal. Choose the approved accounts and a replacement date on or after the reversal date.</p>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <PendingRequestNotice title="Investment replacement" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={async () => { if (await confirmAction('This request may have posted. Check journal history before discarding it. Discard the request?')) pending.discard() }} />
      {review ? <section role="region" aria-label="Review investment replacement"><h3>Review replacement</h3><p>{version?.investmentName} · {review.expectedType} · source {review.transactionId} · reversal {review.predecessorReversalId}</p><p>Replacement date: {review.date}</p><p>Debit {label(review.debitAccountId)}: {review.expectedCurrency} {review.expectedAmountMinor.toLocaleString('en-US')} minor units</p><p>Credit {label(review.creditAccountId)}: {review.expectedCurrency} {review.expectedAmountMinor.toLocaleString('en-US')} minor units</p><button type="button" disabled={busy || !pending.ready || !!pending.pending || !!pending.storageError} onClick={() => void send(review, true)}>{busy ? 'Posting…' : 'Post replacement'}</button> <button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</button></section>
        : <form onSubmit={prepare} style={{ display: 'grid', gap: 16, maxWidth: 620 }}><label>Reversed journal<select style={field} required value={versionId} onChange={e => { setVersionId(e.target.value); setDate(''); setDebit(''); setCredit('') }}><option value="">Select a reversed journal</option>{data.versions.filter(v => v.reversalId && !v.hasSuccessor).map(v => <option key={v.journalId} value={v.journalId}>{v.investmentName} · {v.transactionType} · {v.currency} {v.amountMinor.toLocaleString('en-US')} · reversal {v.reversalDate} · {v.journalId.slice(0, 8)}</option>)}</select></label>{version && <><p>Transaction {version.transactionId} · prior journal {version.journalId} · reversal effective {version.reversalDate}</p><label>Replacement date<DatePickerInput style={field} type="date" required min={version.reversalDate ?? undefined} value={date} onChange={e => setDate(e.target.value)} /></label><label>Replacement debit account<select style={field} required value={debit} onChange={e => setDebit(e.target.value)}><option value="">Select account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</option>)}</select></label><label>Replacement credit account<select style={field} required value={credit} onChange={e => setCredit(e.target.value)}><option value="">Select account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</option>)}</select></label></>}<button disabled={busy || !version || !pending.ready || !!pending.pending || !!pending.storageError}>Review replacement</button></form>}
    </section>
    <section style={panel}><h2>Investment journal history</h2><p>Reversals and replacements affect reports on and after their effective dates. Status is shown as of {data.asOfDate} UTC.</p>{data.versions.length === 0 ? <p>No investment journals recorded.</p> : <ul>{data.versions.map(v => <li key={v.journalId}>{v.investmentName} · {v.transactionType} · transaction {v.transactionId} · {v.isCorrection ? 'replacement' : 'original'} journal {v.journalId} · effective {v.journalDate} · {v.reversalId ? `${v.reversalDate && v.reversalDate > data.asOfDate ? 'reversal scheduled' : 'reversed'} ${v.reversalDate} by ${v.reversalId}` : 'not reversed'}{v.isCorrection === 1 && !v.reversalId && <ReverseReplacement version={v} lines={data.lines.filter(l => l.entryId === v.journalId)} refresh={refresh} />}</li>)}</ul>}</section>
  </>
}

function ReverseReplacement({ version, lines, refresh }: { version: Version; lines: Work['lines']; refresh: () => Promise<unknown> }) {
  const [date, setDate] = useState(''), [reason, setReason] = useState(''), [review, setReview] = useState<{ date: string; reason: string } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function send() { if (!review) return; setBusy(true); setMessage(''); try { await reverseInvestmentCorrectionFn({ data: { journalId: version.journalId, date: review.date, reason: review.reason } }); setReview(null); setMessage('Replacement reversal posted.'); try { await refresh() } catch { setMessage('Reversal posted, but refresh failed. Reload to inspect it.') } } catch { setMessage('Reversal not confirmed. Inspect history before retrying with the same date and reason.') } finally { setBusy(false) } }
  return <details><summary>Reverse replacement</summary><p>This posts the exact opposite lines and retains the transaction and journal.</p>{review ? <section role="region" aria-label="Review replacement reversal"><p>Reversal date: {review.date} · Reason: {review.reason}</p><ul>{lines.map((l, i) => <li key={i}>{l.side === 'debit' ? 'Credit' : 'Debit'} {l.accountCode} — {l.accountName}: {version.currency} {l.amountMinor.toLocaleString('en-US')} minor units</li>)}</ul><button type="button" disabled={busy} onClick={() => void send()}>Post replacement reversal</button> <button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</button></section> : <form onSubmit={e => { e.preventDefault(); if (lines.length !== 2 || !reason.trim()) { setMessage('Journal lines or reason unavailable. Reload and check the details.'); return } setMessage(''); setReview({ date, reason: reason.trim() }) }} style={{ display: 'grid', gap: 12, maxWidth: 500 }}><label>Replacement reversal date<DatePickerInput style={field} type="date" required min={version.journalDate} value={date} onChange={e => setDate(e.target.value)} /></label><label>Replacement reversal reason<input style={field} required maxLength={450} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy}>Review replacement reversal</button></form>}{message && <p role="status">{message}</p>}</details>
}
