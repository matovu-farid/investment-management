import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { parseHoldingCsv } from '#/lib/holding-import/csv'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { holdingImportOptionsFn, previewHoldingImportFn, importHoldingsFn } from '#/server/holding-import/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/holding-import')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => holdingImportOptionsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: HoldingImport,
})
type Preview = Awaited<ReturnType<typeof previewHoldingImportFn>>
type Request = { rows: Preview['rows']; idempotencyKey: string }
function HoldingImport() {
  const options = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'holding-import')
  const [csv, setCsv] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [discard, setDiscard] = useState(false), [refreshFailed, setRefreshFailed] = useState(false)
  const locked = busy || refreshFailed || !pending.ready || !!pending.pending || !!pending.storageError
  async function review(e: React.FormEvent) {
    e.preventDefault(); setPreview(null); setMessage('')
    const parsed = parseHoldingCsv(csv); setIssues(parsed.errors)
    if (parsed.errors.length) return
    setBusy(true)
    try { setPreview(await previewHoldingImportFn({ data: { rows: parsed.rows } })) }
    catch { setIssues(['The batch could not be validated. Check member numbers, joint holding IDs and your access, then try again.']) }
    finally { setBusy(false) }
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setIssues([]); setMessage('')
    try {
      let count = 0
      await pending.send(request, async p => { const result = await importHoldingsFn({ data: { rows: p.rows, requestKey: p.idempotencyKey } }); count = result.count }, isNew)
      setCsv(''); setPreview(null); setMessage(`${count} holding observations recorded. They are not published to members.`)
      try { await router.invalidate() } catch { setRefreshFailed(true); setIssues(['The batch was saved but the register could not refresh. Reload before continuing.']) }
    } catch { setIssues(['Import could not be confirmed. Check the holding register before retrying the retained request unchanged. If reviewed holders or joint members changed, discard only after checking the register, then review again.']) }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/holding-observations" className="quiet">Back to holding observations</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Import holding observations</h1>
    <p>Paste up to 100 verified dated holdings and review every holder and joint recipient before recording. Each entry is a reported snapshot; this does not create a share event, transfer, calculated ownership or publication. Review and publish observations separately if members should see them.</p>
    <p>Validate the source register with the GM before importing. Historical PDF extraction may contain errors.</p>
    <Alert><AlertDescription>Use the exact header <code>member_number,joint_holding_id,observed_date,shares,source</code>. Enter one member number or existing joint holding ID per row, not both. Dates use YYYY-MM-DD; shares are nonnegative whole numbers. Quote fields containing commas, line breaks or quotes and double a quote inside a quoted field. Member numbers are text and retain leading zeros. Each holder may appear once in a batch.</AlertDescription></Alert>
    {!options ? <Alert variant="destructive" role="alert"><AlertDescription>Holder options are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}{issues.length > 0 && <Alert variant="destructive" role="alert"><AlertDescription><p>Review these issues:</p><ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></AlertDescription></Alert>}
      <PendingRequestNotice title="Holding import" pending={pending.pending} storageError={pending.storageError} disabled={busy || refreshFailed} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={() => setDiscard(true)} />
      {discard && <Card className="mt-6"><CardHeader><CardTitle>Discard pending request?</CardTitle><CardDescription>The request may already have been recorded. Check the holding register before discarding it.</CardDescription></CardHeader><CardContent className="flex gap-3"><Button type="button" variant="destructive" disabled={busy} onClick={() => { try { pending.discard(); setDiscard(false) } catch { setIssues(['Could not discard the pending request.']) } }}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscard(false)}>Keep request</Button></CardContent></Card>}
      <Card className="mt-6"><CardHeader><CardTitle>Joint holding IDs</CardTitle></CardHeader><CardContent><details><summary>Find existing joint holding IDs</summary>{options.holdings.length === 0 ? <p>No joint holdings found.</p> : <ul>{options.holdings.map(h => <li key={h.id}>{h.name} · ID {h.id} · {h.members.map(m => `${m.fullName} (${m.memberNumber})`).join(', ')}</li>)}</ul>}</details></CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Paste CSV</CardTitle><CardDescription>Review the holder and source for each observation before recording.</CardDescription></CardHeader><CardContent><form onSubmit={review}><FieldGroup><Field><FieldLabel htmlFor="holding-import-csv">Holding CSV</FieldLabel><Textarea id="holding-import-csv" required rows={10} maxLength={200000} value={csv} disabled={locked} onChange={e => { setCsv(e.target.value); setPreview(null); setIssues([]); setMessage('') }} /></Field><Button disabled={locked || !csv.trim()}>{busy ? <SpinnerLabel>Review holdings</SpinnerLabel> : 'Review holdings'}</Button></FieldGroup></form></CardContent></Card>
      {preview && <Card className="mt-6" aria-label="Holding import preview"><CardHeader><CardTitle>Review {preview.rows.length} observations</CardTitle><CardDescription>The entire batch is recorded together. Verify the holder, joint recipients, date, share count and source for every row. Joint figures represent the whole holding, not an apportioned individual position.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Table><TableHeader><TableRow><TableHead scope="col">Holder</TableHead><TableHead scope="col">Joint recipients</TableHead><TableHead scope="col">Observed</TableHead><TableHead scope="col">Shares</TableHead><TableHead scope="col">Source</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map((r, i) => <TableRow key={i}><TableCell>{r.holderLabel}{r.memberNumber ? ` (${r.memberNumber})` : ` · joint ${r.jointHoldingId}`}</TableCell><TableCell>{r.jointHoldingId ? <ul>{r.jointMembers.map(m => <li key={m.id}>{m.fullName} · {m.memberNumber} · {m.id}</li>)}</ul> : '—'}</TableCell><TableCell>{r.observedDate}</TableCell><TableCell>{r.shares}</TableCell><TableCell>{r.source}</TableCell></TableRow>)}</TableBody></Table><Button type="button" disabled={locked} onClick={() => void send({ rows: preview.rows, idempotencyKey: crypto.randomUUID() }, true)}>Record reviewed observations</Button></CardContent></Card>}
    </>}
  </main></div>
}
