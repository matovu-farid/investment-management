import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { adminBooksFn, previewBooksFn, publishBooksFn, withdrawBooksFn } from '#/server/book-publications/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

import './finance-workspace.css'
export const Route = createFileRoute('/book-publications')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { userId: session.user.id } }, async () => adminBooksFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: BookPublications,
})
type Preview = Awaited<ReturnType<typeof previewBooksFn>>
type PublishRequest = { asOf: string; evidence: Preview['evidence']; idempotencyKey: string }
type WithdrawRequest = { publicationId: string; idempotencyKey: string }
const number = (value: string) => BigInt(value).toLocaleString('en-US')
function Snapshot({ snapshot }: { snapshot: Pick<Preview, 'accounts' | 'totals'> }) {
  return <div className="flex flex-col gap-4">
    <Table><TableHeader><TableRow>{['Code', 'Account', 'Currency', 'Debits', 'Credits', 'Net debit', 'Net credit'].map(h => <TableHead scope="col" key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{snapshot.accounts.map((a, i) => <TableRow key={`${a.currency}-${a.code}-${i}`}>{[a.code, a.name, a.currency, number(a.debits), number(a.credits), number(a.netDebit), number(a.netCredit)].map((v, j) => <TableCell key={j}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>
    {!snapshot.accounts.length && <p>No accounts in this snapshot.</p>}
    <h4>Totals by currency</h4><Table><TableHeader><TableRow>{['Currency', 'Debits', 'Credits', 'Net debit', 'Net credit'].map(h => <TableHead scope="col" key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{snapshot.totals.map(t => <TableRow key={t.currency}>{[t.currency, number(t.debits), number(t.credits), number(t.netDebit), number(t.netCredit)].map((v, i) => <TableCell key={i}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>
  </div>
}
function BookPublications() {
  const history = Route.useLoaderData(), { userId } = Route.useRouteContext(), router = useRouter()
  const [asOf, setAsOf] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const publishing = usePendingRequest<PublishRequest>(userId, 'book-publication')
  const withdrawing = usePendingRequest<WithdrawRequest>(userId, 'book-withdrawal')
  const locked = busy || refreshFailed || !publishing.ready || !withdrawing.ready || !!publishing.pending || !!withdrawing.pending || !!publishing.storageError || !!withdrawing.storageError
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but history could not refresh. Reload before making another change.') } }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check publication history before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  async function load(e: React.FormEvent) { e.preventDefault(); setError(''); setMessage(''); setPreview(null); setBusy(true); try { setPreview(await previewBooksFn({ data: { asOf } })) } catch { setError('The preview is unavailable. Check the date and your access, then try again.') } finally { setBusy(false) } }
  async function publish(v: PublishRequest, isNew: boolean) { setBusy(true); setError(''); setMessage(''); try { let active = false; await publishing.send(v, async p => { const r = await publishBooksFn({ data: { asOf: p.asOf, evidence: p.evidence, requestKey: p.idempotencyKey } }); active = r.active }, isNew); setPreview(null); setMessage(active ? 'Snapshot published to active linked members.' : 'This publication was recorded earlier and is no longer active.'); await refresh() } catch { setError('Publication could not be confirmed. Check history and retry the retained request unchanged. If the ledger changed since the preview, discard the request and review a fresh preview.') } finally { setBusy(false) } }
  async function withdraw(v: WithdrawRequest, isNew: boolean) { setBusy(true); setError(''); setMessage(''); try { await withdrawing.send(v, p => withdrawBooksFn({ data: { publicationId: p.publicationId, requestKey: p.idempotencyKey } }), isNew); setMessage('Snapshot withdrawn from member view.'); await refresh() } catch { setError('Withdrawal could not be confirmed. Check history and retry the retained request unchanged.') } finally { setBusy(false) } }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ACCOUNTING / BOOK PUBLICATIONS</p><h1>Publish group books</h1><Alert><AlertDescription>Share a frozen trial balance with active linked members. Review every account name and amount: account names may contain private information. The snapshot contains aggregate account totals and no individual journal lines.</AlertDescription></Alert>
    {history === null ? <Alert variant="destructive" role="alert" className="mt-6"><AlertDescription>Publication history is unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>{message && <Alert role="status" className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}{error && <Alert variant="destructive" role="alert" className="mt-6"><AlertDescription>{error}</AlertDescription></Alert>}
      <PendingRequestNotice title="Publication" pending={publishing.pending} storageError={publishing.storageError} disabled={busy || refreshFailed} onRetry={() => publishing.pending && void publish(publishing.pending, false)} onDiscard={() => discard(publishing.discard)} />
      <PendingRequestNotice title="Withdrawal" pending={withdrawing.pending} storageError={withdrawing.storageError} disabled={busy || refreshFailed} onRetry={() => withdrawing.pending && void withdraw(withdrawing.pending, false)} onDiscard={() => discard(withdrawing.discard)} />
      <nav className="finance-workspace-nav" aria-label="Book publications sections"><Button asChild type="button" variant="outline"><a href="#books-review">Review a snapshot</a></Button><Button asChild type="button" variant="outline"><a href="#books-history">Publication history</a></Button></nav>
 <Card id="books-review" className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>Review a snapshot</CardTitle><CardDescription>Choose a date and review the account totals before sharing.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><form onSubmit={load}><FieldGroup><Field><FieldLabel htmlFor="books-as-of">As-of date</FieldLabel><DatePickerInput id="books-as-of" required type="date" value={asOf} disabled={locked} onChange={e => { setAsOf(e.target.value); setPreview(null); setError('') }} /></Field><Button disabled={locked || !asOf}>Preview group books</Button></FieldGroup></form>
        {preview && <div aria-label="Member-visible preview" className="flex flex-col gap-4"><h3>Member-visible preview</h3><p>As of {preview.asOf} · preview generated {preview.snapshotAt} UTC. The publication records its own snapshot time. Amounts are integer minor units; posted entries through the as-of date only. A future as-of date includes future-dated posted entries. This snapshot is not necessarily current or approved.</p><Snapshot snapshot={preview} /><Alert><AlertDescription>Publishing shares all account names and totals above with active linked members. The server checks that the ledger still matches this preview.</AlertDescription></Alert><Button type="button" disabled={locked} onClick={() => void publish({ asOf: preview.asOf, evidence: preview.evidence, idempotencyKey: crypto.randomUUID() }, true)}>Publish reviewed snapshot</Button></div>}
      </CardContent></Card><Card id="books-history" className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>Publication history</CardTitle><CardDescription>Review shared and withdrawn snapshots.</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">{history.length === 0 ? <p>No group books have been published.</p> : history.map(p => <article key={p.id} className="flex flex-col gap-3"><h3>As of {p.asOf}</h3><p>Snapshot {p.snapshotAt} UTC · published {p.publishedAt} UTC · {p.withdrawnAt ? <Badge variant="secondary">withdrawn {p.withdrawnAt} UTC</Badge> : <Badge>visible to active linked members</Badge>} · publication {p.id}</p><details><summary>View published snapshot</summary><Snapshot snapshot={p} /></details>{!p.withdrawnAt && <Button variant="outline" type="button" disabled={locked} onClick={async () => { if (await confirmAction(`Withdraw snapshot as of ${p.asOf} from member view?`)) void withdraw({ publicationId: p.id, idempotencyKey: crypto.randomUUID() }, true) }}>Withdraw</Button>}</article>)}</CardContent></Card>
    </>}</main></div>
}
