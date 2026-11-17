import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { parseReportedLoanBalanceCsv } from '#/lib/reported-loan-balance-import/csv'
import { previewReportedLoanBalanceImportFn, importReportedLoanBalancesFn } from '#/server/reported-loan-balance-import/functions'
import { listReportedLoanBalancesFn } from '#/server/reported-loan-balances/functions'

export const Route = createFileRoute('/reported-loan-balance-import')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => listReportedLoanBalancesFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: ReportedLoanBalanceImport,
})

type Preview = Awaited<ReturnType<typeof previewReportedLoanBalanceImportFn>>
type Request = { rows: Preview['rows']; idempotencyKey: string }
const header = 'source_ref,loan_ref,observed_date,amount_minor,basis,source'

function ReportedLoanBalanceImport() {
  const { userId } = Route.useRouteContext(), loans = Route.useLoaderData(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'reported-loan-balance-import')
  const [csv, setCsv] = useState(''), [preview, setPreview] = useState<Preview | null>(null)
  const [issues, setIssues] = useState<string[]>([]), [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [discard, setDiscard] = useState(false)
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError

  async function review(event: React.FormEvent) {
    event.preventDefault(); setPreview(null); setMessage('')
    const parsed = parseReportedLoanBalanceCsv(csv); setIssues(parsed.errors)
    if (parsed.errors.length) return
    setBusy(true)
    try { setPreview(await previewReportedLoanBalanceImportFn({ data: { rows: parsed.rows } })) }
    catch { setIssues(['The batch could not be validated. Check your access, loan references, amounts and dates, then try again.']) }
    finally { setBusy(false) }
  }

  async function send(request: Request, isNew: boolean) {
    setBusy(true); setIssues([]); setMessage('')
    try {
      let count = 0, voidedCount = 0, sourceLoanVoidedCount = 0
      await pending.send(request, async p => { const result = await importReportedLoanBalancesFn({ data: { rows: p.rows, requestKey: p.idempotencyKey } }); count = result.count; voidedCount = result.voidedCount; sourceLoanVoidedCount = result.sourceLoanVoidedCount }, isNew)
      setCsv(''); setPreview(null)
      setMessage(`${count} observations were originally imported. ${voidedCount} ${voidedCount === 1 ? 'observation is' : 'observations are'} currently voided; ${sourceLoanVoidedCount} ${sourceLoanVoidedCount === 1 ? 'has' : 'have'} a currently voided source loan. Review the register for current status. Nothing was published to members or posted to the ledger.`)
      try { await router.invalidate() } catch { setRefreshFailed(true); setIssues(['The batch was saved but the register could not refresh. Reload before continuing.']) }
    } catch { setIssues(['The import could not be confirmed. Check the observation register before retrying the retained request unchanged. If reviewed records changed, discard only after checking the register, then review a fresh batch.']) }
    finally { setBusy(false) }
  }

  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/reported-loan-balances" className="quiet">Back to loan balances</Link></header><main className="dashboard flex flex-col gap-6">
    <div><p className="eyebrow">ADMINISTRATION</p><h1>Import reported loan balances</h1><p>Import dated, source-backed balances for individual loans. Each row is a reported fact, not a calculated balance or an allocation of repayments. Importing does not publish to members or post accounting entries.</p></div>
    <Alert><AlertDescription>Validate the GM’s source records before importing. Use a stable, unique source reference for each observation. A loan reference is an imported loan’s source reference or <code>id:&lt;loan-id&gt;</code> for an existing loan. Duplicate checks cover imported references only; compare with manually recorded observations to avoid recording a fact twice. Review the borrower and loan on every row. Import up to 100 rows per batch.</AlertDescription></Alert>
    {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
    {issues.length > 0 && <Alert variant="destructive" role="alert"><AlertDescription><p>Review these issues:</p><ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></AlertDescription></Alert>}
    <PendingRequestNotice title="Reported balance import" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={() => setDiscard(true)} />
    {discard && <Card><CardHeader><CardTitle>Discard pending request?</CardTitle><CardDescription>The request may already have been recorded. Check the observation register before discarding it.</CardDescription></CardHeader><CardContent className="flex gap-3"><Button type="button" variant="destructive" disabled={busy} onClick={() => { try { pending.discard(); setDiscard(false) } catch { setIssues(['Could not discard the pending request.']) } }}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscard(false)}>Keep request</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>Existing loan IDs</CardTitle><CardDescription>Use an exact ID when the loan has no imported source reference.</CardDescription></CardHeader><CardContent><details><summary>Find existing loan IDs</summary>{loans === null ? <Alert variant="destructive" role="alert"><AlertDescription>The loan register is unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : loans.loans.length === 0 ? <p>No available loans.</p> : <ul>{loans.loans.map(l => <li key={l.id}>{l.memberName} · {l.memberNumber} · {l.currency} {BigInt(l.principalMinor).toLocaleString('en-US')} minor units · disbursed {l.disbursementDate} · <code>id:{l.id}</code></li>)}</ul>}</details></CardContent></Card>
    <Card><CardHeader><CardTitle>Paste CSV</CardTitle><CardDescription>Use the exact header <code>{header}</code>. Dates use YYYY-MM-DD and must be on or after disbursement and no later than today in Kampala. Amounts are non-negative whole minor units in the loan currency. Quote fields containing commas, line breaks or quotes; double a quote inside a quoted field.</CardDescription></CardHeader><CardContent><form onSubmit={review}><FieldGroup><Field><FieldLabel htmlFor="balance-import-csv">Loan balance CSV</FieldLabel><Textarea id="balance-import-csv" required rows={10} maxLength={200000} value={csv} disabled={locked} onChange={event => { setCsv(event.target.value); setPreview(null); setIssues([]); setMessage('') }} /></Field><Button disabled={locked || !csv.trim()}>{busy ? <SpinnerLabel>Review observations</SpinnerLabel> : 'Review observations'}</Button></FieldGroup></form></CardContent></Card>
    {preview && <Card aria-label="Loan balance import preview"><CardHeader><CardTitle>Review {preview.rows.length} observations</CardTitle><CardDescription>The whole batch is recorded together. Verify every borrower, loan, date, amount, basis and source before confirming.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{preview.conflicts.length > 0 && <Alert variant="destructive" role="alert"><AlertDescription><p>Resolve these conflicts before importing:</p><ul>{preview.conflicts.map((conflict, i) => <li key={i}>{conflict}</li>)}</ul></AlertDescription></Alert>}<Table><TableHeader><TableRow>{['Source reference','Borrower and loan','Reported date','Balance (minor units)','Basis','Source'].map(label => <TableHead scope="col" key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.rows.map(row => <TableRow key={row.id}><TableCell>{row.sourceRef}</TableCell><TableCell>{row.memberName} · {row.memberNumber} · {row.memberStatus}<br />Loan {row.loanId} · reference {row.loanRef}<br />Disbursed {row.disbursementDate} · principal {row.currency} {BigInt(row.principalMinor).toLocaleString('en-US')} minor units</TableCell><TableCell>{row.observedDate}</TableCell><TableCell>{row.currency} {BigInt(row.amountMinor).toLocaleString('en-US')}</TableCell><TableCell>{row.basis}</TableCell><TableCell>{row.source}</TableCell></TableRow>)}</TableBody></Table><Button type="button" disabled={locked || preview.conflicts.length > 0} onClick={() => void send({ rows: preview.rows, idempotencyKey: crypto.randomUUID() }, true)}>Import reviewed observations</Button></CardContent></Card>}
  </main></div>
}
