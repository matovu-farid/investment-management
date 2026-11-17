import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { NativeSelect } from '#/components/ui/native-select'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { adminHoldingObservationsFn, recordHoldingObservationFn, voidHoldingObservationFn, publishHoldingObservationFn, withdrawHoldingObservationFn } from '#/server/holding-observations/functions'

export const Route = createFileRoute('/holding-observations')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { user: session.user } }, async () => adminHoldingObservationsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: HoldingObservations,
})

type Holder = { memberId: string | null; jointHoldingId: string | null }
type Preview = Holder & { observedDate: string; shares: string; source: string }
type RecordRequest = Holder & { idempotencyKey: string; observedDate: string; shares: string; source: string; jointMemberIds: string[] }
type VoidRequest = { idempotencyKey: string; observationId: string; reason: string }
type PublishRequest = { idempotencyKey: string; observationId: string; preview: Preview }
type WithdrawRequest = { idempotencyKey: string; publicationId: string }
const number = (s: string) => BigInt(s).toLocaleString('en-US')

function HoldingObservations() {
  const data = Route.useLoaderData(), { user } = Route.useRouteContext(), router = useRouter()
  const [holder, setHolder] = useState(''), [date, setDate] = useState(''), [shares, setShares] = useState(''), [source, setSource] = useState('')
  const [voidId, setVoidId] = useState(''), [reason, setReason] = useState(''), [publishId, setPublishId] = useState('')
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const recording = usePendingRequest<RecordRequest>(user.id, 'holding-observation-record')
  const voiding = usePendingRequest<VoidRequest>(user.id, 'holding-observation-void')
  const publishing = usePendingRequest<PublishRequest>(user.id, 'holding-observation-publish')
  const withdrawing = usePendingRequest<WithdrawRequest>(user.id, 'holding-observation-withdraw')
  const pending = !!(recording.pending || voiding.pending || publishing.pending || withdrawing.pending)
  const unavailable = [recording, voiding, publishing, withdrawing].some(r => !r.ready || !!r.storageError)
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the register could not refresh. Reload before making another change.') } }
  async function discard(action: () => void) { if (await confirmAction('This request may already have been recorded. Check the history before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  async function record(v: RecordRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await recording.send(v, p => recordHoldingObservationFn({ data: { memberId: p.memberId, jointHoldingId: p.jointHoldingId, observedDate: p.observedDate, shares: p.shares, source: p.source, jointMemberIds: p.jointMemberIds, requestKey: p.idempotencyKey } }), isNew); setHolder(''); setDate(''); setShares(''); setSource(''); setMessage('Recording confirmed. Check the history for its current status.'); await refresh() }
    catch { setError('Recording could not be confirmed. Check the history and retry the retained request unchanged.') } finally { setBusy(false) }
  }
  async function voidObservation(v: VoidRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await voiding.send(v, p => voidHoldingObservationFn({ data: { observationId: p.observationId, reason: p.reason, requestKey: p.idempotencyKey } }), isNew); setVoidId(''); setReason(''); setMessage('Observation voided; its history remains visible.'); await refresh() }
    catch { setError('Voiding could not be confirmed. Check the history and retry the retained request unchanged. Withdraw an active publication first.') } finally { setBusy(false) }
  }
  async function publish(v: PublishRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { let active = false; await publishing.send(v, async p => { const result = await publishHoldingObservationFn({ data: { observationId: p.observationId, preview: p.preview, requestKey: p.idempotencyKey } }); active = result.active }, isNew); setPublishId(''); setMessage(active ? 'Observation published to the linked holder or holders.' : 'This publication was recorded previously and has since been withdrawn.'); await refresh() }
    catch { setError('Publication could not be confirmed. Check the history; if the observation changed, discard the request and review the current details before publishing.') } finally { setBusy(false) }
  }
  async function withdraw(v: WithdrawRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await withdrawing.send(v, p => withdrawHoldingObservationFn({ data: { publicationId: p.publicationId, requestKey: p.idempotencyKey } }), isNew); setMessage('Publication withdrawn.'); await refresh() }
    catch { setError('Withdrawal could not be confirmed. Check the publication history and retry the retained request unchanged.') } finally { setBusy(false) }
  }
  const locked = busy || refreshFailed || pending || unavailable
  const selected = data?.observations.find(o => o.id === publishId)
  const recipients = (target: Holder) => {
    if (!data) return null
    if (target.memberId) { const member = data.members.find(m => m.id === target.memberId); return member ? [{ id: member.id, fullName: member.fullName, memberNumber: member.memberNumber }] : null }
    const holding = data.holdings.find(h => h.id === target.jointHoldingId)
    return holding && holding.members.length >= 2 ? holding.members : null
  }
  const holderDetails = (target: Holder) => {
    if (!data) return ''
    if (target.memberId) { const m = data.members.find(x => x.id === target.memberId); return m ? `${m.fullName} (${m.memberNumber}; member ${m.id})` : 'Member details unavailable' }
    const h = data.holdings.find(x => x.id === target.jointHoldingId)
    return h ? `${h.name} (joint holding ${h.id})` : 'Joint holding details unavailable'
  }
  const chosenKind = holder.slice(0, holder.indexOf(':'))
  const chosenId = holder.slice(holder.indexOf(':') + 1)
  const chosenHolder: Holder = { memberId: chosenKind === 'member' ? chosenId : null, jointHoldingId: chosenKind === 'joint' ? chosenId : null }
  const activePublication = (o: Holder) => data?.publications.some(p => !p.withdrawnAt && p.memberId === o.memberId && p.jointHoldingId === o.jointHoldingId)
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Reported shareholdings</h1><p>Record a holding from a dated source, then choose what to publish. An observation is a reported position on its date; it does not calculate a current balance or execute a transfer. Joint holdings are shown as a whole and are not apportioned.</p>
    {!data ? <Alert role="alert" className="mt-6"><AlertDescription>The holding register is unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {message && <p role="status">{message}</p>}{error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <nav className="my-5 flex flex-wrap gap-2" aria-label="Page sections"><Button asChild variant="outline"><a href="#holding-record">Record a holding observation</a></Button><Button asChild variant="outline"><a href="#holding-publish">Publish an observation</a></Button><Button asChild variant="outline"><a href="#holding-publications">Publication history</a></Button><Button asChild variant="outline"><a href="#holding-history">Observation history</a></Button></nav>
      <Card id="holding-record" className="mt-6"><CardHeader><CardTitle>Record a holding observation</CardTitle></CardHeader><CardContent><p>Choose the holder and enter the quantity exactly as reported by the source. The source is visible to the holder if published. Recording an observation for a joint holding locks its member list to preserve who may receive the publication.</p>
        <PendingRequestNotice title="Recording" pending={recording.pending} storageError={recording.storageError} disabled={busy || refreshFailed} onRetry={() => recording.pending && void record(recording.pending, false)} onDiscard={() => discard(recording.discard)} />
        <form onSubmit={e => { e.preventDefault(); const split = holder.indexOf(':'); if (split < 0) return; const kind = holder.slice(0, split), id = holder.slice(split + 1); if (!id || (kind !== 'member' && kind !== 'joint')) return; if (!/^(0|[1-9][0-9]*)$/.test(shares) || BigInt(shares) > 9007199254740991n) { setError('Enter a whole number of shares without leading zeroes.'); return } if (!source.trim()) { setError('Enter the source.'); return } const members = recipients(chosenHolder); if (!members) { setError('Recipient details are unavailable. Reload before recording.'); return } void record({ memberId: kind === 'member' ? id : null, jointHoldingId: kind === 'joint' ? id : null, jointMemberIds: kind === 'joint' ? members.map(m => m.id).sort() : [], observedDate: date, shares, source: source.trim(), idempotencyKey: crypto.randomUUID() }, true) }} style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
          <label>Holder <NativeSelect required value={holder} onChange={e => setHolder(e.target.value)} disabled={locked}><option value="">Select a holder</option><optgroup label="Members">{data.members.map(m => <option key={m.id} value={`member:${m.id}`}>{m.fullName} · {m.memberNumber} · {m.id}</option>)}</optgroup><optgroup label="Joint holdings">{data.holdings.map(h => <option key={h.id} value={`joint:${h.id}`}>{h.name} · {h.id}</option>)}</optgroup></NativeSelect></label>
          {holder && <div aria-label="Holder recipients"><strong>{holderDetails(chosenHolder)}</strong><p>Members who can receive a publication:</p>{recipients(chosenHolder) ? <ul>{recipients(chosenHolder)!.map(m => <li key={m.id}>{m.fullName} · {m.memberNumber} · member {m.id}</li>)}</ul> : <Alert variant="destructive" role="alert"><AlertDescription>Recipient details are unavailable. Reload before recording.</AlertDescription></Alert>}</div>}
          <label>Observation date <DatePickerInput required type="date" value={date} onChange={e => setDate(e.target.value)} disabled={locked} /></label>
          <label>Reported shares <Input required inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={16} value={shares} onChange={e => setShares(e.target.value)} disabled={locked} /></label>
          <label>Source <Input required maxLength={500} value={source} onChange={e => setSource(e.target.value)} disabled={locked} /></label>
          <Button disabled={locked || !holder || !recipients(chosenHolder)}>Record observation</Button>
        </form>
      </CardContent></Card>
      <Card id="holding-publish" className="mt-6"><CardHeader><CardTitle>Publish an observation</CardTitle></CardHeader><CardContent><p>Publication makes the date, quantity and full source visible to the linked holder or holders. Review the source for private information. Withdraw an active publication before publishing a replacement.</p>
        <PendingRequestNotice title="Publication" pending={publishing.pending} storageError={publishing.storageError} disabled={busy || refreshFailed} onRetry={() => publishing.pending && void publish(publishing.pending, false)} onDiscard={() => discard(publishing.discard)} />
        <form onSubmit={e => { e.preventDefault(); if (!selected) return; const { memberId, jointHoldingId, observedDate, shares, source } = selected; void publish({ observationId: selected.id, preview: { memberId, jointHoldingId, observedDate, shares, source }, idempotencyKey: crypto.randomUUID() }, true) }}>
          <label>Recorded observation <NativeSelect required value={publishId} onChange={e => setPublishId(e.target.value)} disabled={locked}><option value="">Select an observation</option>{data.observations.filter(o => !o.voidedAt && !activePublication(o)).map(o => <option key={o.id} value={o.id}>{holderDetails(o)} · {o.observedDate} · {number(o.shares)} shares · {o.source}</option>)}</NativeSelect></label>
          {selected && <div aria-label="Publication preview"><h3>Member-visible preview</h3><p>Holder: {holderDetails(selected)} · {selected.jointHoldingId ? 'joint holding, not apportioned' : 'individual holding'}</p><p>Members who can receive this publication:</p>{recipients(selected) ? <ul>{recipients(selected)!.map(m => <li key={m.id}>{m.fullName} · {m.memberNumber} · member {m.id}</li>)}</ul> : <Alert variant="destructive" role="alert"><AlertDescription>Recipient details are unavailable. Reload before publishing.</AlertDescription></Alert>}<p>{selected.observedDate} · {number(selected.shares)} shares · source: {selected.source}</p><p>Review the full source text for private information before publishing.</p></div>}{' '}
          <Button disabled={locked || !selected || !!selected.voidedAt || !!activePublication(selected) || !recipients(selected)}>Publish observation</Button>
        </form>
      </CardContent></Card>
      <Card id="holding-publications" className="mt-6"><CardHeader><CardTitle>Publication history</CardTitle></CardHeader><CardContent><PendingRequestNotice title="Withdrawal" pending={withdrawing.pending} storageError={withdrawing.storageError} disabled={busy || refreshFailed} onRetry={() => withdrawing.pending && void withdraw(withdrawing.pending, false)} onDiscard={() => discard(withdrawing.discard)} />
        {data.publications.length === 0 ? <p>No observations have been published.</p> : <ul>{data.publications.map(p => <li key={p.id}>Observation {p.observationId} · Holder: {holderDetails(p)} · {p.observedDate} · {number(p.shares)} shares · source: {p.source} · published {p.publishedAt}<p>Recipients: {recipients(p)?.map(m => `${m.fullName} (${m.memberNumber}; member ${m.id})`).join(', ') || 'Recipient details unavailable'}</p>{p.withdrawnAt ? `Withdrawn ${p.withdrawnAt}` : <Button type="button" disabled={locked} onClick={async () => { if (await confirmAction(`Withdraw observation ${p.observationId} for ${holderDetails(p)} from its linked holder or holders?`)) void withdraw({ publicationId: p.id, idempotencyKey: crypto.randomUUID() }, true) }}>Withdraw</Button>}</li>)}</ul>}
      </CardContent></Card>
      <Card id="holding-history" className="mt-6"><CardHeader><CardTitle>Observation history</CardTitle></CardHeader><CardContent><p>To correct an observation, withdraw its publication, void the observation with a reason, then record a new one. Voiding preserves the original for audit.</p><PendingRequestNotice title="Void" pending={voiding.pending} storageError={voiding.storageError} disabled={busy || refreshFailed} onRetry={() => voiding.pending && void voidObservation(voiding.pending, false)} onDiscard={() => discard(voiding.discard)} />
        {data.observations.length === 0 ? <p>No observations recorded.</p> : <ul>{data.observations.map(o => <li key={o.id}>Observation {o.id} · {holderDetails(o)} · {o.observedDate} · {number(o.shares)} shares · source: {o.source} · recorded {o.createdAt} by {o.createdBy} · {o.voidedAt ? `voided ${o.voidedAt} by ${o.voidedBy}: ${o.voidReason}` : 'not voided'}</li>)}</ul>}
        <form onSubmit={e => { e.preventDefault(); void voidObservation({ observationId: voidId, reason, idempotencyKey: crypto.randomUUID() }, true) }} style={{ display: 'grid', gap: 12, maxWidth: 620 }}><label>Observation to void <NativeSelect required value={voidId} onChange={e => setVoidId(e.target.value)} disabled={locked}><option value="">Select an observation</option>{data.observations.filter(o => !o.voidedAt && !data.publications.some(p => p.observationId === o.id && !p.withdrawnAt)).map(o => <option key={o.id} value={o.id}>Observation {o.id} · {holderDetails(o)} · {o.observedDate} · {number(o.shares)} shares</option>)}</NativeSelect></label><label>Reason <Input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={locked} /></label><Button disabled={locked || !voidId}>Void observation</Button></form>
      </CardContent></Card>
    </>}
  </main></div>
}
