import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { confirmAction } from '#/components/confirmation-host'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { getDashboardFn } from '#/server/dashboard/functions'
import { adminInvestmentPublicationsFn, memberInvestmentPublicationsFn, publishInvestmentFn, withdrawInvestmentFn } from '#/server/investment-publications/functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import type { Preview } from '#/server/investment-publications/service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Badge } from '#/components/ui/badge'

export const Route = createFileRoute('/group-investments')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { user: session.user } }, async () => {
    // Each server function enforces its own access checks; start the admin read
    // concurrently and only present it if the independently loaded role allows it.
    const [dashboard, member, adminData] = await Promise.all([getDashboardFn().catch(() => null), memberInvestmentPublicationsFn().catch(() => null), adminInvestmentPublicationsFn().catch(() => null)])
    const admin = dashboard?.kind === 'admin' ? adminData : null
    return { dashboard, member, admin }
  }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: GroupInvestments,
})
const amount = (s: string) => BigInt(s).toLocaleString('en-US')
function GroupInvestments() {
  const { user } = Route.useRouteContext(), { dashboard, member, admin } = Route.useLoaderData(), router = useRouter()
  const [valuationId, setValuationId] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [refreshFailed, setRefreshFailed] = useState(false)
  const publication = usePendingRequest<{ idempotencyKey: string; valuationId: string; preview: Preview }>(user.id, 'investment-publication')
  const withdrawal = usePendingRequest<{ idempotencyKey: string; publicationId: string }>(user.id, 'investment-publication-withdrawal')
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the page could not refresh. Reload before making another change.') } }
  async function publish(value: NonNullable<typeof publication.pending>, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await publication.send(value, async p => { const result = await publishInvestmentFn({ data: { valuationId: p.valuationId, preview: p.preview, requestKey: p.idempotencyKey } }); active = result.active }, isNew)
      setValuationId(''); setMessage(active ? 'Investment observation published.' : 'This publication was recorded previously and has since been withdrawn. It is not visible to members.'); await refresh()
    } catch { setError('Publication could not be confirmed. Check the history. If the observation changed or this is an older pending request without a preview, discard it and review the current details before publishing.') }
    finally { setBusy(false) }
  }
  async function withdraw(value: NonNullable<typeof withdrawal.pending>, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await withdrawal.send(value, p => withdrawInvestmentFn({ data: { publicationId: p.publicationId, requestKey: p.idempotencyKey } }), isNew); setMessage('Publication withdrawn.'); await refresh() }
    catch { setError('Withdrawal could not be confirmed. Check the publication history and retry the retained request unchanged.') }
    finally { setBusy(false) }
  }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check the publication history first. Discard it?')) { try { action() } catch { setError('Could not discard the pending request.') } } }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard"><p className="eyebrow">MEMBER PORTAL</p><h1>Group investments</h1><Alert><AlertDescription>These are dated observations explicitly published by an administrator. Values may be estimates and are not a cash balance or a complete portfolio valuation.</AlertDescription></Alert>
    {dashboard === null && <Card className="mt-6"><CardContent className="pt-6"><p>Access could not be checked. Please reload and try again.</p></CardContent></Card>}
    {dashboard?.kind === 'member' && (member === null ? <Card className="mt-6"><CardContent className="pt-6"><p>Published investments are unavailable. An active linked member account is required; if you have access, try again later.</p></CardContent></Card> : <Card className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>Published observations</CardTitle><CardDescription>Values and their sources as published for members.</CardDescription></CardHeader><CardContent>{member.length === 0 ? <p>No investment observations are currently published.</p> : <div className="grid gap-4 md:grid-cols-2">{member.map(p => <article key={p.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="m-0 break-words font-semibold">{p.name}</h3><Badge variant="secondary">{p.assetClass}</Badge></div><p className="m-0 text-2xl font-semibold tabular-nums">{p.currency} {amount(p.amountMinor)} <span className="text-sm font-normal text-muted-foreground">minor units</span></p><dl className="m-0 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Observed</dt><dd className="m-0">{p.valuationDate}</dd></div><div><dt className="text-muted-foreground">Basis</dt><dd className="m-0 break-words">{p.basis}</dd></div><div><dt className="text-muted-foreground">Source</dt><dd className="m-0 break-words">{p.source || 'Not recorded'}</dd></div><div><dt className="text-muted-foreground">Published (UTC)</dt><dd className="m-0 break-words">{p.publishedAt}</dd></div></dl></article>)}</div>}</CardContent></Card>)}
    {dashboard?.kind === 'admin' && (admin === null ? <Card className="mt-6"><CardContent className="pt-6"><p>Publication controls are unavailable. Reload and try again.</p></CardContent></Card> : <>
      <Card className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>Publish an observation</CardTitle><CardDescription>Choose a recorded valuation to review.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert><AlertDescription>Review every field below before publishing. The basis and source are free text and may contain private information. Publication makes all displayed details visible to active linked members. To replace an observation, withdraw the active publication first.</AlertDescription></Alert>{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <PendingRequestNotice title="Publication" pending={publication.pending} storageError={publication.storageError} disabled={busy || refreshFailed} onRetry={() => publication.pending && void publish(publication.pending, false)} onDiscard={() => discard(publication.discard)} />
      <form onSubmit={e => { e.preventDefault(); const selected = admin.options.find(o => o.valuationId === valuationId); if (!selected) return; const { investmentId, name, assetClass, currency, valuationDate, amountMinor, basis, source } = selected; void publish({ valuationId, preview: { investmentId, name, assetClass, currency, valuationDate, amountMinor, basis, source }, idempotencyKey: crypto.randomUUID() }, true) }}><FieldGroup><Field><FieldLabel htmlFor="investment-observation">Recorded observation</FieldLabel><NativeSelect id="investment-observation" required value={valuationId} onChange={e => setValuationId(e.target.value)}><NativeSelectOption value="">Select an observation</NativeSelectOption>{admin.options.map(o => <NativeSelectOption key={o.valuationId} value={o.valuationId}>{o.name} · {o.assetClass} · {o.valuationDate} · {o.currency} {amount(o.amountMinor)} minor units · {o.basis} · {o.source || 'source not recorded'}</NativeSelectOption>)}</NativeSelect></Field>{valuationId && (() => { const selected = admin.options.find(o => o.valuationId === valuationId); return selected ? <Alert aria-label="Publication preview"><AlertDescription><strong>Member-visible preview</strong><p><strong>{selected.name}</strong> · {selected.assetClass} · {selected.currency} {amount(selected.amountMinor)} minor units · observed {selected.valuationDate} · basis: {selected.basis} · source: {selected.source || 'not recorded'}</p><p>Review the basis and source for private information before publishing.</p></AlertDescription></Alert> : null })()}<Button disabled={busy || refreshFailed || !valuationId || !publication.ready || !!publication.pending || !!publication.storageError || !admin.options.length}>Publish to members</Button></FieldGroup></form></CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>Publication history</CardTitle><CardDescription>Review published and withdrawn observations.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><PendingRequestNotice title="Withdrawal" pending={withdrawal.pending} storageError={withdrawal.storageError} disabled={busy || refreshFailed} onRetry={() => withdrawal.pending && void withdraw(withdrawal.pending, false)} onDiscard={() => discard(withdrawal.discard)} />{admin.publications.length === 0 ? <p>No observations have been published.</p> : <ul className="flex flex-col gap-4">{admin.publications.map(p => <li key={p.id}><strong>{p.name}</strong> · {p.assetClass} · {p.currency} {amount(p.amountMinor)} minor units · observed {p.valuationDate} · basis: {p.basis} · source: {p.source || 'not recorded'} · published {p.publishedAt} · {p.withdrawnAt ? <Badge variant="secondary">withdrawn {p.withdrawnAt}</Badge> : <Button variant="outline" type="button" disabled={busy || refreshFailed || !withdrawal.ready || !!withdrawal.pending || !!withdrawal.storageError} onClick={async () => { if (await confirmAction('Withdraw this observation from members?')) void withdraw({ publicationId: p.id, idempotencyKey: crypto.randomUUID() }, true) }}>Withdraw</Button>}</li>)}</ul>}</CardContent></Card>
    </>)}
  </main></div>
}
