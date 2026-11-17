import { Checkbox } from "#/components/ui/checkbox.tsx"
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { confirmAction } from '#/components/confirmation-host'
import { correctBillingEventFn, previewBillingCorrectionFn } from '#/server/loan-billing-corrections/functions'

type Preview = Awaited<ReturnType<typeof previewBillingCorrectionFn>>
type Request = {idempotencyKey:string;eventId:string;expectedEventDate:string;expectedRevision:number;reason:string;periodOpenConfirmed:true}

export function BillingCorrection({userId,eventId,accounts,onComplete,onMutationStart,onMutationEnd}:{userId:string;eventId:string|undefined;accounts:{id:string;code:string;name:string}[];onComplete:()=>Promise<unknown>;onMutationStart:()=>void;onMutationEnd:()=>void}) {
  const pending=usePendingRequest<Request>(userId,'billing-correction')
  const [preview,setPreview]=useState<Preview|null>(null),[reason,setReason]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const locked=busy||!pending.ready||!!pending.pending||!!pending.storageError
  async function load(){if(!eventId)return;setBusy(true);setError('');setMessage('');try{setPreview(await previewBillingCorrectionFn({data:{eventId}}));setReason('');setOpen(false)}catch{setError('Could not load the latest event for correction. Refresh and try again.')}finally{setBusy(false)}}
  async function send(request:Request,isNew:boolean){onMutationStart();setBusy(true);setError('');try{await pending.send(request,v=>correctBillingEventFn({data:{eventId:v.eventId,requestKey:v.idempotencyKey,expectedEventDate:v.expectedEventDate,expectedRevision:v.expectedRevision,reason:v.reason,periodOpenConfirmed:v.periodOpenConfirmed}}),isNew);setPreview(null);setMessage('Correction posted. Review the history and prepare a new billing preview.');try{await onComplete()}catch{setMessage('Correction posted, but the history could not refresh. Reload before continuing.')}}catch{setError('Correction was not confirmed. Check billing history and retry the same request.')}finally{setBusy(false);onMutationEnd()}}
  return <Card className="mt-6"><CardHeader><CardTitle>Correct the latest billing event</CardTitle><CardDescription>Corrections reverse the latest active event first. Repeat in reverse order if later events depend on the one you need to correct.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <PendingRequestNotice title="Billing correction" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={()=>pending.pending&&void send(pending.pending,false)} onDiscard={async()=>{if(await confirmAction('This correction may already have posted. Check the history before discarding it. Discard?'))pending.discard()}} />
    {error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message&&<Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
    {!preview ? <div><Button type="button" variant="outline" disabled={locked||!eventId} onClick={()=>void load()}>Review latest event for correction</Button></div> : <><Alert><AlertDescription>The exact journal reversals will be dated {preview.event.eventDate}. Dynamic reports for that date and later will change; saved snapshots do not change. Continue only when that accounting period is open.</AlertDescription></Alert>
      <p>Original event {preview.event.id} · {preview.event.currency}. The following original lines will be reversed with opposite debit/credit sides:</p><ul>{preview.lines.map((line,i)=>{const account=accounts.find(a=>a.id===line.accountId);return <li key={`${line.entryId}-${line.accountId}-${i}`}>{line.entryId} · {account ? `${account.code} — ${account.name}` : 'Account unavailable'} ({line.accountId}) · {line.side} · {line.amountMinor.toLocaleString('en-US')} minor units</li>})}</ul>
      <label>Reason for correction <Input maxLength={450} required value={reason} disabled={locked} onChange={e=>setReason(e.target.value)} /></label><label><Checkbox checked={open} disabled={locked} onCheckedChange={nextChecked=>setOpen((nextChecked===true))} /> I confirm the original accounting period is open for this correction.</label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={locked||!open||!reason.trim()} onClick={()=>{const request:Request={idempotencyKey:crypto.randomUUID(),eventId:preview.event.id,expectedEventDate:preview.event.eventDate,expectedRevision:preview.revision,reason:reason.trim(),periodOpenConfirmed:true};void send(request,true)}}>Post reviewed correction</Button><Button type="button" variant="outline" disabled={locked} onClick={()=>setPreview(null)}>Cancel review</Button></div></>}
  </CardContent></Card>
}
