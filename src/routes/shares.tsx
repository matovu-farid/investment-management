import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { Checkbox } from "#/components/ui/checkbox.tsx"
import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {usePendingRequest, PendingRequestNotice} from '#/lib/pending-requests/use-pending'
import { getSession } from '#/lib/auth.functions'
import { listSharesFn, createShareEventFn, createJointHoldingFn } from '#/server/shares/functions'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/shares')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session=await getSession(); if (!session) throw redirect({to:'/login'}); return {owner:session.user.id} }, async () => { try { return { data: await listSharesFn(), available: true } } catch { return { data: null, available: false } } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: Shares,
})
function Shares() {
  const { data, available } = Route.useLoaderData(), router = useRouter(), {owner} = Route.useRouteContext()
  const [holder, setHolder] = useState(''), [type, setType] = useState('opening'), [shares, setShares] = useState(''), [date, setDate] = useState(''), [reference, setReference] = useState(''), [notes, setNotes] = useState('')
  const [jointName, setJointName] = useState(''), [selected, setSelected] = useState<string[]>([])
  const [jointReview, setJointReview] = useState<{idempotencyKey:string;name:string;members:{id:string;memberNumber:string;fullName:string}[]} | null>(null)
  const eventPending=usePendingRequest<{idempotencyKey:string;memberId:string|null;jointHoldingId:string|null;eventType:string;shares:number;eventDate:string;reference:string;notes:string}>(owner,'share-event')
  const jointPending=usePendingRequest<{idempotencyKey:string;name:string;members:{id:string;memberNumber:string;fullName:string}[]}>(owner,'joint-holding')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  async function discardPending(discard:()=>void){if(!await confirmAction('Discard this pending request? It may already have been saved. Check the register first; a new submission can create a duplicate.'))return;try{discard()}catch{setError('Could not discard the pending request. Check browser storage and the register.')}}
  async function sendEvent(payload:NonNullable<typeof eventPending.pending>,isNew:boolean) { setBusy(true); setError(''); setMessage(''); try { await eventPending.send(payload,p=>createShareEventFn({data:{...p,requestId:p.idempotencyKey}}),isNew); setShares(''); setReference(''); setNotes(''); setMessage('Share event recorded.'); await router.invalidate().catch(()=>setError('Saved successfully, but the register could not refresh. Reload the page to view the saved record.')) } catch { setError('Could not confirm the event. Check the register and retry the retained request unchanged.') } finally { setBusy(false) } }
  async function record(e:React.FormEvent) { e.preventDefault(); const [kind,id]=holder.split(':'); await sendEvent({idempotencyKey:crypto.randomUUID(),memberId:kind==='member'?id:null,jointHoldingId:kind==='joint'?id:null,eventType:type,shares:Number(shares),eventDate:date,reference,notes},true) }
  async function sendJoint(payload:NonNullable<typeof jointPending.pending>,isNew:boolean) { setBusy(true); setError(''); setMessage(''); try { if(!Array.isArray(payload.members)) throw new Error('A new review is required'); await jointPending.send(payload,p=>createJointHoldingFn({data:{...p,requestId:p.idempotencyKey}}),isNew); setJointName(''); setSelected([]); setJointReview(null); setMessage('Joint holding added.'); await router.invalidate().catch(()=>setError('Saved successfully, but the register could not refresh. Reload the page to view the saved record.')) } catch { setError('Could not confirm the joint holding. Check the register; retry the retained request unchanged if uncertain. If member identities changed, or the request predates identity review, discard it after checking and review again.') } finally { setBusy(false) } }
  function joint(e:React.FormEvent) { e.preventDefault(); if(!data) return; if(!jointName.trim()){setError('Enter a holding name.');return} const members=selected.map(id=>data.members.find(m=>m.id===id)).filter((m): m is NonNullable<typeof m> => !!m).map(({id,memberNumber,fullName})=>({id,memberNumber,fullName})); if(members.length!==selected.length || members.length<2){setError('Select at least two available members.');return} setError(''); setJointReview({idempotencyKey:crypto.randomUUID(),name:jointName.trim(),members}) }
  return <div className="app"><header><Link to="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet" style={{textDecoration:'none'}}>Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Share register</h1><p className="lead">Record share events for members and joint holdings.</p>
    {!available || !data ? <Alert role="alert"><AlertDescription>This register is unavailable or you do not have permission to view it.</AlertDescription></Alert> : <div className="flex flex-col gap-6">
      <Alert><AlertDescription>Events record the facts provided. They do not execute a transfer, settle a sale, or calculate a valuation.</AlertDescription></Alert>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <PendingRequestNotice title="Share event" pending={eventPending.pending} storageError={eventPending.storageError} disabled={busy} onRetry={()=>eventPending.pending&&void sendEvent(eventPending.pending,false)} onDiscard={()=>discardPending(eventPending.discard)}/>
      <Card><CardHeader><CardTitle>Record a share event</CardTitle><CardDescription>Enter the recorded change for a member or joint holding.</CardDescription></CardHeader><CardContent>
        <form onSubmit={record} className="max-w-xl"><FieldGroup>
          <Field><FieldLabel htmlFor="share-holder">Holder</FieldLabel><NativeSelect id="share-holder" required value={holder} onChange={e=>setHolder(e.target.value)}><option value="">Select a holder</option><optgroup label="Members">{data.members.map(m=><option key={m.id} value={`member:${m.id}`}>{m.fullName} ({m.memberNumber})</option>)}</optgroup><optgroup label="Joint holdings">{data.holdings.map(h=><option key={h.id} value={`joint:${h.id}`}>{h.name}</option>)}</optgroup></NativeSelect></Field>
          <Field><FieldLabel htmlFor="share-type">Event type</FieldLabel><NativeSelect id="share-type" value={type} onChange={e=>setType(e.target.value)}>{['opening','issue','bonus','purchase','sale','exit','adjustment'].map(t=><option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="share-count">Number of shares</FieldLabel><Input id="share-count" type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER} required value={shares} onChange={e=>setShares(e.target.value)}/></Field>
          <Field><FieldLabel htmlFor="share-date">Event date</FieldLabel><DatePickerInput id="share-date" required value={date} onChange={e=>setDate(e.target.value)}/></Field>
          <Field><FieldLabel htmlFor="share-reference">Reference (optional)</FieldLabel><Input id="share-reference" maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></Field>
          <Field><FieldLabel htmlFor="share-notes">Notes (optional)</FieldLabel><Textarea id="share-notes" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
          <Button disabled={busy || !eventPending.ready || !!eventPending.pending || !!eventPending.storageError}>{busy ? <SpinnerLabel>Record event</SpinnerLabel> : 'Record event'}</Button>
        </FieldGroup></form>
      </CardContent></Card>
      <PendingRequestNotice title="Joint holding" pending={jointPending.pending} storageError={jointPending.storageError} disabled={busy} onRetry={()=>jointPending.pending&&void sendJoint(jointPending.pending,false)} onDiscard={()=>discardPending(jointPending.discard)}/>
      <Card><CardHeader><CardTitle>Add a joint holding</CardTitle><CardDescription>Select at least two active members and review their identities. Linked members may see joint holding records. This does not assign ownership percentages.</CardDescription></CardHeader><CardContent>
      {jointReview ? <div aria-label="Review joint holding" className="flex flex-col gap-4"><h3>Review before adding</h3><p>Holding: <strong>{jointReview.name}</strong></p><ul>{jointReview.members.map(m=><li key={m.id}>{m.fullName} · {m.memberNumber} · member {m.id}</li>)}</ul><p>Verify each person before adding this joint holding.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !jointPending.ready || !!jointPending.pending || !!jointPending.storageError} onClick={()=>void sendJoint(jointReview,true)}>Confirm joint holding</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setJointReview(null)}>Edit</Button></div></div> : <form onSubmit={joint} className="max-w-xl"><FieldGroup>
        <Field><FieldLabel htmlFor="joint-name">Holding name</FieldLabel><Input id="joint-name" required maxLength={200} value={jointName} onChange={e=>setJointName(e.target.value)}/></Field>
        <FieldSet><FieldLegend>Active members</FieldLegend>{data.members.filter(m=>m.status==='active').map(m=><label key={m.id} className="flex items-center gap-2"><Checkbox checked={selected.includes(m.id)} onCheckedChange={nextChecked=>setSelected((nextChecked===true)?[...selected,m.id]:selected.filter(id=>id!==m.id))}/> {m.fullName} ({m.memberNumber})</label>)}</FieldSet>
        <Button disabled={busy || selected.length < 2 || !jointPending.ready || !!jointPending.pending || !!jointPending.storageError}>Review joint holding</Button>
      </FieldGroup></form>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Joint holdings</CardTitle></CardHeader><CardContent>{data.holdings.length === 0 ? <p>No joint holdings recorded yet.</p> : <ul>{data.holdings.map(h => <li key={h.id}><strong>{h.name}</strong> — {h.members}</li>)}</ul>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Recorded events</CardTitle></CardHeader><CardContent>{data.events.length===0 ? <p>No share events recorded yet.</p> : <Table><TableHeader><TableRow>{['Date','Holder','Event','Shares','Reference','Notes','Correction status'].map(x=><TableHead key={x} scope="col">{x}</TableHead>)}</TableRow></TableHeader><TableBody>{data.events.map(event=><TableRow key={event.id}>{[event.eventDate,event.holderName,event.eventType,event.shares,event.reference || '—',event.notes || '—',event.voidedAt ? `Voided ${event.voidedAt} UTC · ${event.voidReason}` : 'Recorded'].map((x,i)=><TableCell key={i}>{x}</TableCell>)}</TableRow>)}</TableBody></Table>}</CardContent></Card>
    </div>}
  </main></div>
}
