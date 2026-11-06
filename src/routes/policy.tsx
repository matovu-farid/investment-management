import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { getSession } from '#/lib/auth.functions'
import { addPolicyTargetFn, listPolicyTargetsFn } from '#/server/policy/functions'
import {PendingRequestNotice,usePendingRequest} from '#/lib/pending-requests/use-pending'
import { validatePolicyRange } from '#/lib/policy-range'

export const Route=createFileRoute('/policy')({
 beforeLoad:async()=>{const session=await getSession();if(!session) throw redirect({to:'/login'});return {userId:session.user.id}},
 loader:async()=>{try{return {targets:await listPolicyTargetsFn(),available:true}}catch{return {targets:[],available:false}}},
 component:PolicyPage,
})
type PolicyRequest={idempotencyKey:string;assetClass:string;effectiveDate:string;minBasisPoints:string;maxBasisPoints:string;targetBasisPoints:string;source:string;notes:string}
function PolicyPage(){
 const {targets,available}=Route.useLoaderData(),router=useRouter(),{userId}=Route.useRouteContext()
 const pending=usePendingRequest<PolicyRequest>(userId,'policy-range')
 const [assetClass,setAssetClass]=useState(''),[date,setDate]=useState(''),[min,setMin]=useState(''),[max,setMax]=useState(''),[target,setTarget]=useState(''),[source,setSource]=useState(''),[notes,setNotes]=useState('')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 async function refreshAfterSave(confirmed:string){setMessage(confirmed);try{await router.invalidate()}catch{setMessage(`${confirmed} The list could not be refreshed; reload the page to see the saved record.`)}}
 async function send(payload:PolicyRequest,isNew:boolean){setBusy(true);setError('');setMessage('');try{await pending.send(payload,v=>addPolicyTargetFn({data:{requestKey:v.idempotencyKey,assetClass:v.assetClass,effectiveDate:v.effectiveDate,minBasisPoints:v.minBasisPoints,maxBasisPoints:v.maxBasisPoints,targetBasisPoints:v.targetBasisPoints,source:v.source,notes:v.notes}}),isNew);setAssetClass('');setMin('');setMax('');setTarget('');setSource('');setNotes('');await refreshAfterSave('Policy range recorded.')}catch{setError('Policy range was not confirmed. Check the register, then retry the pending request unchanged if the result is uncertain.')}finally{setBusy(false)}}
 async function submit(e:React.FormEvent){e.preventDefault();try{const range=validatePolicyRange(min,max,target);await send({idempotencyKey:crypto.randomUUID(),assetClass,effectiveDate:date,minBasisPoints:range.min,maxBasisPoints:range.max,targetBasisPoints:range.target,source,notes},true)}catch(error){setError(error instanceof Error?error.message:'Check the percentage values and try again.')}}
 async function discardPending(){if(await confirmAction('This request may already have been recorded. Check the register before discarding it. Discard the pending request?')){try{pending.discard()}catch{setError('Could not discard the pending request in this tab.')}}}
 return <div className="app"><header><Link to="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet" style={{textDecoration:'none'}}>Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Investment policy</h1><p className="lead">Record the approved allocation ranges and their source.</p>
 {!available?<Alert role="alert"><AlertDescription>This register is unavailable or you do not have permission to view it.</AlertDescription></Alert>:<>
 <Alert className="mt-6"><AlertDescription>These are policy records, not a compliance calculation. Confirm the current policy and allocation basis before interpreting them.</AlertDescription></Alert>
 {error&&<Alert variant="destructive" className="mt-4" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message&&<Alert className="mt-4" role="status"><AlertDescription>{message}</AlertDescription></Alert>}
 <Card className="mt-6"><CardHeader><CardTitle>Record a policy range</CardTitle><CardDescription>Enter the allocation range and the policy source or approval reference.</CardDescription></CardHeader><CardContent>
 <PendingRequestNotice title="Policy range" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={()=>{if(pending.pending)void send(pending.pending,false)}} onDiscard={discardPending}/>
 <form onSubmit={submit} className="max-w-2xl"><FieldGroup>
 <Field><FieldLabel htmlFor="policy-class">Asset class</FieldLabel><Input id="policy-class" value={assetClass} onChange={e=>setAssetClass(e.target.value)} maxLength={100} required/></Field>
 <Field><FieldLabel htmlFor="policy-date">Effective date</FieldLabel><DatePickerInput id="policy-date" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></Field>
 <Field><FieldLabel htmlFor="policy-min">Minimum allocation (%)</FieldLabel><Input id="policy-min" inputMode="decimal" pattern="[0-9]{1,3}([.][0-9]{1,2})?" value={min} onChange={e=>setMin(e.target.value)} required/></Field>
 <Field><FieldLabel htmlFor="policy-max">Maximum allocation (%)</FieldLabel><Input id="policy-max" inputMode="decimal" pattern="[0-9]{1,3}([.][0-9]{1,2})?" value={max} onChange={e=>setMax(e.target.value)} required/></Field>
 <Field><FieldLabel htmlFor="policy-target">Target allocation (%) (optional)</FieldLabel><Input id="policy-target" inputMode="decimal" pattern="[0-9]{1,3}([.][0-9]{1,2})?" value={target} onChange={e=>setTarget(e.target.value)}/></Field>
 <Field><FieldLabel htmlFor="policy-source">Source or approval reference</FieldLabel><Input id="policy-source" value={source} onChange={e=>setSource(e.target.value)} required maxLength={500}/></Field>
 <Field><FieldLabel htmlFor="policy-notes">Notes (optional)</FieldLabel><Textarea id="policy-notes" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000}/></Field>
 <Field><Button disabled={busy||!pending.ready||!!pending.pending||!!pending.storageError}>{busy?'Saving…':'Record range'}</Button></Field>
 </FieldGroup></form></CardContent></Card>
 <Card className="mt-6"><CardHeader><CardTitle>Recorded policy ranges ({targets.length})</CardTitle><CardDescription>Ranges are shown with their effective dates and source records.</CardDescription></CardHeader><CardContent>{targets.length===0?<p>No policy ranges recorded yet.</p>:<Table><TableHeader><TableRow>{['Effective date','Asset class','Minimum','Maximum','Target','Source','Notes'].map(x=><TableHead key={x} scope="col">{x}</TableHead>)}</TableRow></TableHeader><TableBody>{targets.map(t=><TableRow key={t.id}>{[t.effectiveDate,t.assetClass,t.minBasisPoints===null?'—':`${(t.minBasisPoints/100).toFixed(2)}%`,t.maxBasisPoints===null?'—':`${(t.maxBasisPoints/100).toFixed(2)}%`,t.targetBasisPoints===null?'—':`${(t.targetBasisPoints/100).toFixed(2)}%`,t.source,t.notes||'—'].map((v,i)=><TableCell key={i}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>}</CardContent></Card>
 </>}</main></div>
}
