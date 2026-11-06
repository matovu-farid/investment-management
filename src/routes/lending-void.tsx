import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { usePendingRequest, PendingRequestNotice } from '#/lib/pending-requests/use-pending'
import { listLendingFn } from '#/server/lending/functions'
import { voidLendingSourceFn } from '#/server/lending-void/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'

export const Route = createFileRoute('/lending-void')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  loader: async () => { try { return await listLendingFn() } catch { return null } },
  component: LendingVoid,
})

type Request = { idempotencyKey: string; sourceKind: 'loan' | 'repayment'; sourceId: string; reason: string }

function LendingVoid() {
  const data = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'lending-source-void')
  const [kind, setKind] = useState<'loan' | 'repayment'>('repayment')
  const [sourceId, setSourceId] = useState(''), [reason, setReason] = useState('')
  const [review, setReview] = useState<Request | null>(null), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [discardReview, setDiscardReview] = useState(false)
  const loan = data?.loans.find(l => l.id === sourceId)
  const repayment = data?.repayments.find(r => r.id === sourceId)
  const repaymentLoan = data?.loans.find(l => l.id === repayment?.loanId)
  function description(k: 'loan' | 'repayment', id: string) {
    const l = data?.loans.find(item => item.id === (k === 'loan' ? id : data.repayments.find(r => r.id === id)?.loanId))
    const r = k === 'repayment' ? data?.repayments.find(item => item.id === id) : undefined
    return k === 'loan' ? `${l?.memberName ?? 'Unknown member'} · ${l?.currency ?? ''} ${l?.principalMinor.toLocaleString('en-US') ?? '—'} minor units · disbursed ${l?.disbursementDate ?? '—'} · loan ${id}` : `${l?.memberName ?? 'Unknown member'} · ${l?.currency ?? ''} ${r?.amountMinor.toLocaleString('en-US') ?? '—'} minor units · paid ${r?.paymentDate ?? '—'} · repayment ${id} · loan ${r?.loanId ?? '—'}`
  }
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    const source = kind === 'loan' ? loan : repayment
    if (!source || source.voidedAt || !reason.trim()) { setError('Select a recorded source and enter a reason.'); return }
    setReview({ idempotencyKey: crypto.randomUUID(), sourceKind: kind, sourceId, reason: reason.trim() })
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      await pending.send(request, v => voidLendingSourceFn({ data: { sourceKind: v.sourceKind, sourceId: v.sourceId, reason: v.reason, requestKey: v.idempotencyKey } }), isNew)
      setReview(null); setSourceId(''); setReason(''); setMessage('Source marked void. The source and its history remain in the register.')
      try { await router.invalidate() } catch { setError('The void was recorded, but the register could not refresh. Reload before continuing.') }
    } catch { setError('The void could not be confirmed. Review the source and its dependencies, then retry the retained request unchanged if its outcome is uncertain.') }
    finally { setBusy(false) }
  }
  function discard() { try { pending.discard(); setDiscardReview(false) } catch { setError('Could not discard the pending request.') } }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans</Link></header><main className="dashboard flex flex-col gap-6">
    <div><p className="eyebrow">ADMINISTRATION</p><h1>Void an erroneous lending record</h1><p>Mark an incorrect loan or repayment as void while retaining its audit history.</p></div>
    <Alert><AlertDescription>This action cannot be undone and does not reverse accounting entries. Reverse posted journals and replacements first; reversals must be effective on or before the current UTC date. A loan cannot be voided while linked repayments, fulfilments, term changes or collateral records remain active. Review and correct erroneous dependencies separately; the system checks them when you confirm.</AlertDescription></Alert>
    <nav aria-label="Correction tools" className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/loan-reconciliation">Review loan accounting</Link></Button><Button asChild variant="outline"><Link to="/loan-terms">Loan term changes</Link></Button><Button asChild variant="outline"><Link to="/collateral">Collateral records</Link></Button><Button asChild variant="outline"><Link to="/fulfilment-void">Booking fulfilments</Link></Button></nav>
    {!data ? <Alert role="alert" variant="destructive"><AlertDescription>The lending register is unavailable or access could not be confirmed.</AlertDescription></Alert> : <>
      {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <PendingRequestNotice title="Source void" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => { if (pending.pending) void send(pending.pending, false) }} onDiscard={() => setDiscardReview(true)} />
      {discardReview && <Card aria-label="Confirm discarding request"><CardHeader><CardTitle>Discard pending request?</CardTitle><CardDescription>The request may already have been recorded. Check the void history before discarding it.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={discard}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscardReview(false)}>Keep request</Button></CardContent></Card>}
      <Card><CardHeader><CardTitle>Review a record</CardTitle><CardDescription>Select an erroneous record and give a reason.</CardDescription></CardHeader><CardContent>{review ? <section role="region" aria-label="Confirm source void" className="flex flex-col gap-3"><p><strong>{description(review.sourceKind, review.sourceId)}</strong></p><p>Reason: {review.reason}</p><p>Confirm this is an erroneous record and its posted journals have been reversed. Existing linked records may prevent a loan void. This cannot be undone.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={busy || !pending.ready || !!pending.pending || !!pending.storageError} onClick={() => void send(review, true)}>{busy ? 'Saving…' : 'Confirm void'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button></div></section> : <form onSubmit={prepare} className="max-w-2xl"><FieldGroup>
        <Field><FieldLabel htmlFor="void-kind">Record type</FieldLabel><NativeSelect id="void-kind" value={kind} onChange={e => { setKind(e.target.value as 'loan' | 'repayment'); setSourceId('') }}><NativeSelectOption value="repayment">Repayment</NativeSelectOption><NativeSelectOption value="loan">Loan</NativeSelectOption></NativeSelect></Field>
        <Field><FieldLabel htmlFor="void-source">Record</FieldLabel><NativeSelect id="void-source" required value={sourceId} onChange={e => setSourceId(e.target.value)}><NativeSelectOption value="">Select a recorded {kind}</NativeSelectOption>{kind === 'loan' ? data.loans.filter(l => !l.voidedAt).map(l => <NativeSelectOption key={l.id} value={l.id}>{description('loan', l.id)}</NativeSelectOption>) : data.repayments.filter(r => !r.voidedAt).map(r => <NativeSelectOption key={r.id} value={r.id}>{description('repayment', r.id)}</NativeSelectOption>)}</NativeSelect></Field>
        {kind === 'repayment' && repayment && <p>Reference: {repayment.reference || 'none'} · associated loan: {repaymentLoan?.id ?? repayment.loanId}</p>}
        <Field><FieldLabel htmlFor="void-reason">Reason</FieldLabel><Textarea id="void-reason" required maxLength={450} value={reason} onChange={e => setReason(e.target.value)} /></Field><Button disabled={busy || !sourceId || !pending.ready || !!pending.pending || !!pending.storageError}>Review void</Button>
      </FieldGroup></form>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Voided records</CardTitle><CardDescription>Original records and their reasons remain available for review.</CardDescription></CardHeader><CardContent>{!data.loans.some(l => l.voidedAt) && !data.repayments.some(r => r.voidedAt) ? <p>No lending records have been voided.</p> : <ul className="flex flex-col gap-3">{data.loans.filter(l => l.voidedAt).map(l => <li key={l.id}>Loan · {description('loan', l.id)} · voided {l.voidedAt} UTC · {l.voidReason}</li>)}{data.repayments.filter(r => r.voidedAt).map(r => <li key={r.id}>Repayment · {description('repayment', r.id)} · voided {r.voidedAt} UTC · {r.voidReason}</li>)}</ul>}</CardContent></Card>
    </>}
  </main></div>
}
