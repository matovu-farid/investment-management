import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { adminShareValuesFn, publishShareValueFn, withdrawShareValueFn } from '#/server/share-values/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'

export const Route = createFileRoute('/share-values')({
  beforeLoad: async () => { const session = await getSession(); if (!session) throw redirect({ to: '/login' }); return { user: session.user } },
  loader: async () => adminShareValuesFn().catch(() => null),
  component: ShareValues,
})

type PublishRequest = { idempotencyKey: string; holdingPublicationId: string; preview: { memberId: string | null; jointHoldingId: string | null; observedDate: string; shares: string; holdingSource: string; recipientIds: string[] }; priceDate: string; priceMinor: string; currency: string; basis: string; priceSource: string }
type WithdrawRequest = { idempotencyKey: string; publicationId: string }
const number = (s: string) => BigInt(s).toLocaleString('en-US')
const validPrice = (s: string) => /^(0|[1-9][0-9]{0,15})$/.test(s) && BigInt(s) <= 9007199254740991n

function ShareValues() {
  const data = Route.useLoaderData(), { user } = Route.useRouteContext(), router = useRouter()
  const [holdingId, setHoldingId] = useState(''), [priceDate, setPriceDate] = useState(''), [priceMinor, setPriceMinor] = useState(''), [currency, setCurrency] = useState('UGX'), [basis, setBasis] = useState(''), [priceSource, setPriceSource] = useState('')
  const [busy, setBusy] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const publishing = usePendingRequest<PublishRequest>(user.id, 'share-value-publish')
  const withdrawing = usePendingRequest<WithdrawRequest>(user.id, 'share-value-withdraw')
  const locked = busy || refreshFailed || !!publishing.pending || !!withdrawing.pending || !publishing.ready || !withdrawing.ready || !!publishing.storageError || !!withdrawing.storageError
  const selected = data?.holdings.find(h => h.publicationId === holdingId)
  async function refresh() { try { await router.invalidate() } catch { setRefreshFailed(true); setError('Saved, but the register could not refresh. Reload before making another change.') } }
  function discard(action: () => void) { if (window.confirm('This request may already have been recorded. Check the history before discarding it. Discard the request?')) { try { action() } catch { setError('The pending request could not be discarded.') } } }
  async function publish(v: PublishRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try {
      let active = false
      await publishing.send(v, async p => {
        if (!p.preview || !Array.isArray(p.preview.recipientIds)) throw new Error('Incomplete saved request')
        const result = await publishShareValueFn({ data: { holdingPublicationId: p.holdingPublicationId, preview: p.preview, priceDate: p.priceDate, priceMinor: p.priceMinor, currency: p.currency, basis: p.basis, priceSource: p.priceSource, requestKey: p.idempotencyKey } })
        active = result.active
      }, isNew)
      setMessage(active ? 'Indicative value published to the linked holder or holders.' : 'This publication was recorded previously and is no longer active.'); setHoldingId(''); await refresh()
    } catch { setError('Publication could not be confirmed. Check the history and retry the retained request unchanged. If the holding or recipients changed, or the saved request is incomplete, discard it and review the current details before publishing.') } finally { setBusy(false) }
  }
  async function withdraw(v: WithdrawRequest, isNew: boolean) {
    setBusy(true); setError(''); setMessage('')
    try { await withdrawing.send(v, p => withdrawShareValueFn({ data: { publicationId: p.publicationId, requestKey: p.idempotencyKey } }), isNew); setMessage('Indicative value withdrawn.'); await refresh() }
    catch { setError('Withdrawal could not be confirmed. Check the history and retry the retained request unchanged.') } finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Indicative share values</h1>
    <Alert className="mt-6"><AlertDescription>Publish a manually supplied price against a published holding. The resulting value is indicative: it is not necessarily current or approved and must not be used as borrowing capacity. Joint holdings show the whole position, without apportionment.</AlertDescription></Alert>
    {!data ? <Alert className="mt-6" variant="destructive" role="alert"><AlertDescription>Share values are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {message && <Alert className="mt-6" role="status"><AlertDescription>{message}</AlertDescription></Alert>}{error && <Alert className="mt-6" variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card className="mt-6"><CardHeader><CardTitle><h2>Publish an indicative value</h2></CardTitle><CardDescription>The price is entered in the currency’s minor units per share. Both source descriptions and the basis are visible to recipients; review them for private information.</CardDescription></CardHeader><CardContent>
        <PendingRequestNotice title="Publication" pending={publishing.pending} storageError={publishing.storageError} disabled={busy || refreshFailed} onRetry={() => publishing.pending && void publish(publishing.pending, false)} onDiscard={() => discard(publishing.discard)} />
        <form onSubmit={e => { e.preventDefault(); if (!selected || !validPrice(priceMinor) || !/^[A-Z]{3}$/.test(currency) || !basis.trim() || !priceSource.trim() || !priceDate || selected.recipients.length === 0) { setError('Complete the holding, date, whole-number price, three-letter currency, basis and source. Recipient details must be available.'); return } void publish({ holdingPublicationId: selected.publicationId, preview: { memberId: selected.memberId, jointHoldingId: selected.jointHoldingId, observedDate: selected.observedDate, shares: selected.shares, holdingSource: selected.holdingSource, recipientIds: selected.recipients.map(r => r.id).sort() }, priceDate, priceMinor, currency, basis: basis.trim(), priceSource: priceSource.trim(), idempotencyKey: crypto.randomUUID() }, true) }} className="max-w-2xl">
          <FieldGroup>
            <Field><FieldLabel htmlFor="value-holding">Published holding</FieldLabel><NativeSelect id="value-holding" required value={holdingId} onChange={e => setHoldingId(e.target.value)} disabled={locked}><NativeSelectOption value="">Select a holding</NativeSelectOption>{data.holdings.map(h => <NativeSelectOption key={h.publicationId} value={h.publicationId}>{h.holderLabel} · {h.observedDate} · {number(h.shares)} shares · {h.publicationId}</NativeSelectOption>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="value-date">Price date</FieldLabel><DatePickerInput id="value-date" required value={priceDate} onChange={e => setPriceDate(e.target.value)} disabled={locked} /></Field>
            <Field><FieldLabel htmlFor="value-price">Price per share (integer minor units)</FieldLabel><Input id="value-price" required inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={16} value={priceMinor} onChange={e => setPriceMinor(e.target.value)} disabled={locked} /></Field>
            <Field><FieldLabel htmlFor="value-currency">Currency (three-letter code)</FieldLabel><Input id="value-currency" required pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} disabled={locked} /></Field>
            <Field><FieldLabel htmlFor="value-basis">Basis</FieldLabel><Input id="value-basis" required maxLength={500} value={basis} onChange={e => setBasis(e.target.value)} disabled={locked} /></Field>
            <Field><FieldLabel htmlFor="value-source">Price source</FieldLabel><Input id="value-source" required maxLength={500} value={priceSource} onChange={e => setPriceSource(e.target.value)} disabled={locked} /></Field>
            {selected && <Card aria-label="Publication preview"><CardHeader><CardTitle><h3>Member-visible preview and recipients</h3></CardTitle><CardDescription>{selected.holderLabel} · {selected.jointHoldingId ? 'joint holding, whole position, not apportioned' : 'individual holding'}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><p>Recipients:</p>{selected.recipients.length ? <ul>{selected.recipients.map(r => <li key={r.id}>{r.fullName} · {r.memberNumber} · member {r.id}</li>)}</ul> : <Alert variant="destructive" role="alert"><AlertDescription>Recipient details are unavailable. Reload before publishing.</AlertDescription></Alert>}<p>Holding observed {selected.observedDate} · {number(selected.shares)} shares · source: {selected.holdingSource}</p><p>Price date: {priceDate || 'not entered'} · price: {validPrice(priceMinor) ? number(priceMinor) : 'not entered'} {currency} minor units per share · basis: {basis || 'not entered'} · source: {priceSource || 'not entered'}</p>{validPrice(priceMinor) && <p>Indicative total: <strong>{number((BigInt(selected.shares) * BigInt(priceMinor)).toString())} {currency} minor units</strong></p>}{priceDate && priceDate !== selected.observedDate && <Alert role="alert"><AlertDescription>The price date differs from the holding observation date. Review both dates before publishing.</AlertDescription></Alert>}<p>This value is not necessarily current or approved and is not borrowing capacity.</p></CardContent></Card>}
            <Button type="submit" disabled={locked || !selected || !selected.recipients.length}>Publish indicative value</Button>
          </FieldGroup>
        </form>
      </CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle><h2>Publication history</h2></CardTitle><CardDescription>Previously published values and their current status.</CardDescription></CardHeader><CardContent><PendingRequestNotice title="Withdrawal" pending={withdrawing.pending} storageError={withdrawing.storageError} disabled={busy || refreshFailed} onRetry={() => withdrawing.pending && void withdraw(withdrawing.pending, false)} onDiscard={() => discard(withdrawing.discard)} />
        {data.publications.length === 0 ? <p>No indicative values have been published.</p> : <div className="flex flex-col gap-4">{data.publications.map(p => <Card key={p.id}><CardHeader><CardTitle><h3>Publication {p.id}</h3></CardTitle><CardDescription>Holding {p.holdingPublicationId} · published {p.publishedAt}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><p>Observed {p.observedDate} · {number(p.shares)} shares · holding source: {p.holdingSource}</p><p>Price date {p.priceDate} · {number(p.priceMinor)} {p.currency} minor units per share · basis: {p.basis} · price source: {p.priceSource}</p><p>Indicative total {number(p.valueMinor)} {p.currency} minor units</p><div><Badge variant="secondary">{p.withdrawnAt ? `withdrawn ${p.withdrawnAt}` : p.active ? 'active' : 'inactive (holding no longer published)'}</Badge></div>{!p.withdrawnAt && <div><Button type="button" variant="outline" disabled={locked} onClick={() => { if (window.confirm(`Withdraw indicative value publication ${p.id}?`)) void withdraw({ publicationId: p.id, idempotencyKey: crypto.randomUUID() }, true) }}>Withdraw</Button></div>}</CardContent></Card>)}</div>}
      </CardContent></Card>
    </>}
  </main></div>
}
