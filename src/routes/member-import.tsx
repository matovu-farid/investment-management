import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { parseMemberCsv, type MemberImportRow } from '#/lib/member-import/csv'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { previewMemberImportFn, importMembersFn } from '#/server/member-import/functions'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/member-import')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } },
  component: MemberImport,
})
type Request = { rows: MemberImportRow[]; idempotencyKey: string }
type Preview = Awaited<ReturnType<typeof previewMemberImportFn>>
function MemberImport() {
  const { userId } = Route.useRouteContext(), router = useRouter()
  const pending = usePendingRequest<Request>(userId, 'member-import')
  const [csv, setCsv] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [discard, setDiscard] = useState(false)
  const locked = busy || !pending.ready || !!pending.pending || !!pending.storageError
  async function review(e: React.FormEvent) {
    e.preventDefault(); setPreview(null); setMessage('')
    const parsed = parseMemberCsv(csv); setIssues(parsed.errors)
    if (parsed.errors.length) return
    setBusy(true)
    try { setPreview(await previewMemberImportFn({ data: { rows: parsed.rows } })) }
    catch { setIssues(['Could not validate this batch. Check the records and your access, then try again.']) }
    finally { setBusy(false) }
  }
  async function send(request: Request, isNew: boolean) {
    setBusy(true); setIssues([]); setMessage('')
    try {
      let count = 0
      await pending.send(request, async p => { const result = await importMembersFn({ data: { rows: p.rows, requestKey: p.idempotencyKey } }); count = result.count }, isNew)
      setCsv(''); setPreview(null); setMessage(`${count} member records created. No accounts, holdings or balances were created.`)
      try { await router.invalidate() } catch { setIssues(['The import was saved, but the register could not refresh. Reload before continuing.']) }
    } catch { setIssues(['Import could not be confirmed. Check the member register and retry the retained request unchanged. If a member number now exists, discard only after checking the register, then review an updated batch.']) }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/members" className="quiet">Back to members</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Import member records</h1>
    <p>Paste up to 100 verified records as CSV, then review every row before creating the batch. This creates member records only; it does not create accounts, shareholdings or balances. Validate source registers with the GM before importing; historical PDF extraction may contain errors.</p>
    <Alert className="mt-6"><AlertTitle>CSV format</AlertTitle><AlertDescription>Use the exact header <code>member_number,full_name,email</code>. Email is optional: omit the column or leave a cell empty. Quote fields containing commas, line breaks or quotes; double a quote within a quoted field. Member numbers are treated as text, preserving leading zeros. Exact duplicate member numbers are rejected.</AlertDescription></Alert>
    {message && <Alert role="status" className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}{issues.length > 0 && <Alert role="alert" variant="destructive" className="mt-6"><AlertTitle>Review these issues</AlertTitle><AlertDescription><ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></AlertDescription></Alert>}
    <PendingRequestNotice title="Member import" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={() => pending.pending && void send(pending.pending, false)} onDiscard={() => setDiscard(true)} />
    {discard && <Card className="mt-6"><CardHeader><CardTitle>Discard pending request?</CardTitle><CardDescription>The request may already have been recorded. Check the member register before discarding it.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><Button type="button" variant="destructive" disabled={busy} onClick={() => { try { pending.discard(); setDiscard(false) } catch { setIssues(['Could not discard pending request.']) } }}>Discard request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscard(false)}>Keep request</Button></CardContent></Card>}
    <Card className="mt-6"><CardHeader><CardTitle>Paste CSV</CardTitle><CardDescription>Review the complete batch before importing.</CardDescription></CardHeader><CardContent><form onSubmit={review}><FieldGroup><Field><FieldLabel htmlFor="member-csv">Member CSV</FieldLabel><Textarea id="member-csv" required rows={10} maxLength={100000} value={csv} disabled={locked} onChange={e => { setCsv(e.target.value); setPreview(null); setIssues([]); setMessage('') }} /></Field><Button disabled={locked || !csv.trim()}>{busy ? 'Checking…' : 'Review members'}</Button></FieldGroup></form></CardContent></Card>
    {preview && <Card className="mt-6" aria-label="Member import preview"><CardHeader><CardTitle>Review {preview.rows.length} member records</CardTitle><CardDescription>The whole batch is created together. Review names, member numbers and email addresses before confirming.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{preview.conflicts.length > 0 && <Alert role="alert" variant="destructive"><AlertTitle>These member numbers already exist</AlertTitle><AlertDescription>Resolve every conflict before importing:<ul>{preview.conflicts.map(c => <li key={c}>{c}</li>)}</ul></AlertDescription></Alert>}<Table><TableHeader><TableRow><TableHead scope="col">Member number</TableHead><TableHead scope="col">Full name</TableHead><TableHead scope="col">Email</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map((r, i) => <TableRow key={i}><TableCell>{r.memberNumber}</TableCell><TableCell>{r.fullName}</TableCell><TableCell>{r.email ?? '—'}</TableCell></TableRow>)}</TableBody></Table><div><Button type="button" disabled={locked || preview.conflicts.length > 0} onClick={() => void send({ rows: preview.rows, idempotencyKey: crypto.randomUUID() }, true)}>Confirm member import</Button></div></CardContent></Card>}
  </main></div>
}
