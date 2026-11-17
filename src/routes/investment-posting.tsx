import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { listInvestmentPostingFn, postInvestmentTransactionFn, reverseInvestmentTransactionFn } from '#/server/investment-posting/functions'
import { listInvestmentCorrectionWorkFn } from '#/server/investment-corrections/functions'
import { InvestmentCorrections } from '#/components/investment-corrections'
import { describeInvestmentPosting } from '#/lib/investment-posting-status'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/investment-posting')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => { try { const [posting, corrections] = await Promise.all([listInvestmentPostingFn(), listInvestmentCorrectionWorkFn()]); return { posting, corrections } } catch { return null } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: InvestmentPosting,
})

type Review = { transactionId: string; investmentId: string; investmentName: string; date: string; type: string; amount: number; currency: string; debitId: string; debitLabel: string; creditId: string; creditLabel: string }

function InvestmentPosting() {
  const loaded = Route.useLoaderData(), data = loaded?.posting, router = useRouter(), { userId } = Route.useRouteContext()
  const [transactionId, setTransactionId] = useState(''), [debitId, setDebitId] = useState(''), [creditId, setCreditId] = useState('')
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const transaction = data?.transactions.find(t => t.id === transactionId)
  const accounts = data?.accounts.filter(a => a.currency === transaction?.currency) ?? []
  function prepare(event: React.FormEvent) {
    event.preventDefault()
    const debit = accounts.find(a => a.id === debitId), credit = accounts.find(a => a.id === creditId)
    if (!transaction || !debit || !credit || debit.id === credit.id) return
    setError(''); setMessage('')
    setReview({ transactionId: transaction.id, investmentId: transaction.investmentId, investmentName: transaction.investmentName, date: transaction.transactionDate, type: transaction.transactionType, amount: transaction.amountMinor, currency: transaction.currency, debitId: debit.id, debitLabel: `${debit.code} — ${debit.name}`, creditId: credit.id, creditLabel: `${credit.code} — ${credit.name}` })
  }
  async function post() {
    if (!review) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await postInvestmentTransactionFn({ data: { transactionId: review.transactionId, debitAccountId: review.debitId, creditAccountId: review.creditId, expectedInvestmentId: review.investmentId, expectedDate: review.date, expectedType: review.type, expectedAmountMinor: review.amount, expectedCurrency: review.currency } })
      const status = result.active ? 'Investment journal posted.' : `The journal was previously posted${result.reversalId ? ' and subsequently reversed' : ''}${result.sourceVoidedAt ? '; its source was subsequently voided' : ''}. Inspect the history.`
      setReview(null); setTransactionId(''); setDebitId(''); setCreditId(''); setMessage(status)
      try { await router.invalidate() } catch { setMessage(`${status} The list could not refresh; reload to inspect it.`) }
    } catch {
      setError('Posting was not confirmed. Check the refreshed status and ledger before retrying. If source details changed, cancel and review them again.')
      try { await router.invalidate() } catch { setError('Posting was not confirmed and the list could not refresh. Reload and check the ledger before retrying.') }
    } finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/investments" className="quiet">Investment register</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Post investment transactions</h1><p className="lead">Create a balanced journal for a recorded investment transaction.</p>
    {!data ? <Alert role="alert" className="mt-6"><AlertDescription>This page is unavailable or you do not have permission.</AlertDescription></Alert> : <><p>Choose the debit and credit accounts according to the organisation’s approved treatment. The amount, date and currency come from the recorded transaction; the transaction type does not determine the accounts.</p>{error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <Card className="mt-6"><CardHeader><CardTitle><h2>Post a recorded transaction</h2></CardTitle></CardHeader><CardContent>{review ? <section role="region" aria-label="Review investment journal"><h3>Review journal</h3><p>{review.investmentName} · {review.type} · {review.date} · transaction {review.transactionId}</p><p>Debit {review.debitLabel}: {review.currency} {review.amount.toLocaleString('en-US')} minor units</p><p>Credit {review.creditLabel}: {review.currency} {review.amount.toLocaleString('en-US')} minor units</p><p>Confirm the recorded transaction and approved accounts.</p><Button type="button" disabled={busy} onClick={() => void post()}>{busy ? <SpinnerLabel>Post investment journal</SpinnerLabel> : 'Post investment journal'}</Button> <Button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</Button></section> : <form onSubmit={prepare} className="max-w-2xl"><FieldGroup><Field><FieldLabel htmlFor="investment-post-transaction">Transaction</FieldLabel><NativeSelect id="investment-post-transaction" required value={transactionId} onChange={e => { setTransactionId(e.target.value); setDebitId(''); setCreditId('') }}><option value="">Select an unposted transaction</option>{data.transactions.filter(t => !t.journalId && !loaded?.corrections.versions.some(v => v.transactionId === t.id)).map(t => <option key={t.id} value={t.id}>{t.investmentName} · {t.transactionType} · {t.transactionDate} · {t.currency} {t.amountMinor.toLocaleString('en-US')} · {t.id.slice(0, 8)}</option>)}</NativeSelect></Field><Field><FieldLabel htmlFor="investment-post-debit">Debit account</FieldLabel><NativeSelect id="investment-post-debit" required value={debitId} onChange={e => setDebitId(e.target.value)}><option value="">Select account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</option>)}</NativeSelect></Field><Field><FieldLabel htmlFor="investment-post-credit">Credit account</FieldLabel><NativeSelect id="investment-post-credit" required value={creditId} onChange={e => setCreditId(e.target.value)}><option value="">Select account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</option>)}</NativeSelect></Field><Button disabled={busy || !transaction || !debitId || !creditId || debitId === creditId}>Review journal</Button></FieldGroup></form>}</CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle><h2>Transaction posting status</h2></CardTitle></CardHeader><CardContent>{data.transactions.length === 0 ? <p>No investment transactions recorded.</p> : <ul>{data.transactions.map(t => <li key={t.id}>{t.investmentName} · {t.transactionType} · {t.transactionDate} · {t.currency} {t.amountMinor.toLocaleString('en-US')} minor units · {describeInvestmentPosting(t, loaded?.corrections.versions.filter(v => v.transactionId === t.id) ?? [], loaded?.corrections.asOfDate ?? '')}{t.journalId && !t.reversalId && loaded?.corrections.versions.some(v => v.transactionId === t.id && v.journalId === t.journalId && !v.reversalId && !v.hasSuccessor) && <Reversal transactionId={t.id} investmentName={t.investmentName} journalId={t.journalId} currency={t.currency} earliestDate={t.transactionDate} lines={data.lines.filter(l => l.entryId === t.journalId)} onComplete={() => router.invalidate()} />}</li>)}</ul>}</CardContent></Card>
      {loaded && <InvestmentCorrections data={loaded.corrections} userId={userId} refresh={() => router.invalidate()} />}
    </>}</main></div>
}

function Reversal({ transactionId, investmentName, journalId, currency, earliestDate, lines, onComplete }: { transactionId: string; investmentName: string; journalId: string; currency: string; earliestDate: string; lines: { accountCode: string; accountName: string; side: 'debit' | 'credit'; amountMinor: number }[]; onComplete: () => Promise<unknown> }) {
  const [date, setDate] = useState(''), [reason, setReason] = useState(''), [review, setReview] = useState<{ date: string; reason: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  function prepare(event: React.FormEvent) { event.preventDefault(); setError(''); setMessage(''); if (lines.length !== 2) { setError('Original journal lines are unavailable. Reload and check the ledger before continuing.'); return } if (!reason.trim()) { setError('Enter a reason.'); return } setReview({ date, reason: reason.trim() }) }
  async function reverse() { if (!review) return; setBusy(true); setError(''); setMessage(''); try { await reverseInvestmentTransactionFn({ data: { transactionId, effectiveDate: review.date, reason: review.reason } }); setReview(null); setMessage('Reversal posted.'); try { await onComplete() } catch { setMessage('Reversal posted, but the list could not refresh. Reload to see it.') } } catch { setError('Reversal was not confirmed. Check the ledger before retrying with the same date and reason.') } finally { setBusy(false) } }
  return <details><summary>Reverse investment journal</summary><p>This posts the exact opposite lines and retains the original transaction and journal. The offset affects reports on and after its effective date. A replacement can be posted against the same transaction after reversal.</p>{review ? <section role="region" aria-label="Review investment reversal"><h3>Review reversal</h3><p>{investmentName} · transaction {transactionId} · journal {journalId}</p><p>Reversal date: {review.date} · Reason: {review.reason}</p><Table><TableHeader><TableRow><TableHead scope="col">Account</TableHead><TableHead scope="col">Reversal side</TableHead><TableHead scope="col">Amount (minor units)</TableHead></TableRow></TableHeader><TableBody>{lines.map((line, i) => <TableRow key={i}><TableCell>{line.accountCode} — {line.accountName}</TableCell><TableCell>{line.side === 'debit' ? 'credit' : 'debit'}</TableCell><TableCell>{currency} {line.amountMinor.toLocaleString('en-US')}</TableCell></TableRow>)}</TableBody></Table><Button type="button" disabled={busy} onClick={() => void reverse()}>{busy ? <SpinnerLabel>Post reversal</SpinnerLabel> : 'Post reversal'}</Button> <Button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</Button></section> : <form onSubmit={prepare} className="max-w-lg"><FieldGroup><Field><FieldLabel htmlFor={`investment-reversal-date-${transactionId}`}>Reversal date</FieldLabel><DatePickerInput id={`investment-reversal-date-${transactionId}`} type="date" required min={earliestDate} value={date} onChange={e => setDate(e.target.value)} /></Field><Field><FieldLabel htmlFor={`investment-reversal-reason-${transactionId}`}>Reason</FieldLabel><Input id={`investment-reversal-reason-${transactionId}`} required maxLength={450} value={reason} onChange={e => setReason(e.target.value)} /></Field><Button disabled={busy}>Review reversal</Button></FieldGroup></form>}{error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}</details>
}
