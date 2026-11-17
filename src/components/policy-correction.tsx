import {useState,type FormEvent} from 'react'
import {Button} from '#/components/ui/button'
import {Input} from '#/components/ui/input'
import {DatePickerInput} from '#/components/ui/date-picker'
import {Textarea} from '#/components/ui/textarea'
import {Alert,AlertDescription} from '#/components/ui/alert'
import {Field,FieldGroup,FieldLabel} from '#/components/ui/field'
import {confirmAction} from '#/components/confirmation-host'
import {PendingRequestNotice,usePendingRequest} from '#/lib/pending-requests/use-pending'
import {validatePolicyRange} from '#/lib/policy-range'
import {correctPolicyTargetFn,listPolicyCorrectionsFn} from '#/server/policy/functions'
import type {PolicyTarget} from '#/server/policy/service'

type Request={expectedAssetClass?:string;expectedEffectiveDate?:string;assetClass?:string;effectiveDate?:string;idempotencyKey:string;policyId:string;expectedCorrectionId:string|null;expectedMinBasisPoints:number|null;expectedMaxBasisPoints:number|null;expectedTargetBasisPoints:number|null;expectedSource:string|null;expectedNotes:string|null;minBasisPoints:number;maxBasisPoints:number;targetBasisPoints:number|null;source:string;notes:string|null;reason:string}
type History=Awaited<ReturnType<typeof listPolicyCorrectionsFn>>
const percent=(value:number|null)=>value===null?'':(value/100).toFixed(2)

export function PolicyCorrection({policy,userId,onSaved}:{policy:PolicyTarget;userId:string;onSaved:()=>Promise<unknown>}){
 const pending=usePendingRequest<Request>(userId,`policy-correction:${policy.id}`)
 const [assetClass,setAssetClass]=useState(policy.assetClass),[effectiveDate,setEffectiveDate]=useState(policy.effectiveDate)
 const [min,setMin]=useState(percent(policy.minBasisPoints)),[max,setMax]=useState(percent(policy.maxBasisPoints)),[target,setTarget]=useState(percent(policy.targetBasisPoints)),[source,setSource]=useState(policy.source??''),[notes,setNotes]=useState(policy.notes??''),[reason,setReason]=useState('')
 const [review,setReview]=useState<Request|null>(null),[history,setHistory]=useState<History|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const locked=busy||!pending.ready||!!pending.pending||!!pending.storageError
 function prepare(e:FormEvent){e.preventDefault();setError('');try{const range=validatePolicyRange(min,max,target);if(!source.trim()||!reason.trim()||!assetClass.trim()||!effectiveDate)throw new Error('Enter a class, effective date, source and reason.');setReview({expectedAssetClass:policy.assetClass,expectedEffectiveDate:policy.effectiveDate,assetClass:assetClass.trim(),effectiveDate,idempotencyKey:crypto.randomUUID(),policyId:policy.id,expectedCorrectionId:policy.correctionId??null,expectedMinBasisPoints:policy.minBasisPoints,expectedMaxBasisPoints:policy.maxBasisPoints,expectedTargetBasisPoints:policy.targetBasisPoints,expectedSource:policy.source??null,expectedNotes:policy.notes??null,minBasisPoints:Number(range.min),maxBasisPoints:Number(range.max),targetBasisPoints:range.target===''?null:Number(range.target),source:source.trim(),notes:notes.trim()||null,reason:reason.trim()})}catch(e){setError(e instanceof Error?e.message:'Check the range and try again.')}}
 async function send(request:Request,isNew:boolean){setBusy(true);setError('');setMessage('');try{await pending.send(request,v=>correctPolicyTargetFn({data:{...v,requestKey:v.idempotencyKey}}),isNew);setReview(null);setMessage('Correction recorded.');try{await onSaved()}catch{setMessage('Correction recorded; reload to refresh the register.')}}catch{setError('Correction not confirmed. The range may have changed; refresh and review it before retrying.')}finally{setBusy(false)}}
 async function loadHistory(){setBusy(true);setError('');try{setHistory(await listPolicyCorrectionsFn({data:policy.id}))}catch{setError('Correction history is unavailable.')}finally{setBusy(false)}}
 return <details><summary>Correct policy or view history</summary><div className="flex flex-col gap-3 py-3">
  <p>Correct the values for {policy.assetClass}, effective {policy.effectiveDate}. The original and each correction remain in history; saved board drafts retain their captured values. The original class and date remain reserved, even after a correction.</p>
  {error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message&&<Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
  <PendingRequestNotice title="Policy correction" pending={pending.pending} storageError={pending.storageError} disabled={busy} onRetry={()=>{if(pending.pending)void send(pending.pending,false)}} onDiscard={async()=>{if(await confirmAction('Check the policy history before discarding an uncertain correction. Discard?')){try{pending.discard()}catch{setError('Could not discard the pending correction in this tab.')}}}} />
  {review?<section aria-label="Review policy correction"><p>Class: {policy.assetClass} → {review.assetClass} · effective date: {policy.effectiveDate} → {review.effectiveDate}</p><p>New range: {(review.minBasisPoints/100).toFixed(2)}–{(review.maxBasisPoints/100).toFixed(2)}%{review.targetBasisPoints===null?'':` · target ${(review.targetBasisPoints/100).toFixed(2)}%`}.</p><p>Source: {review.source} · reason: {review.reason}</p><p>Notes: {review.notes??'none'}</p><Button type="button" disabled={locked} onClick={()=>void send(review,true)}>Confirm correction</Button> <Button type="button" variant="outline" disabled={busy} onClick={()=>setReview(null)}>Back</Button></section>:<form onSubmit={prepare}><FieldGroup>
   <Field><FieldLabel htmlFor={`policy-correction-class-${policy.id}`}>Asset class</FieldLabel><Input id={`policy-correction-class-${policy.id}`} value={assetClass} onChange={e=>setAssetClass(e.target.value)} maxLength={100} required disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-date-${policy.id}`}>Effective date</FieldLabel><DatePickerInput id={`policy-correction-date-${policy.id}`} value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)} required disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-min-${policy.id}`}>Minimum (%)</FieldLabel><Input id={`policy-correction-min-${policy.id}`} value={min} onChange={e=>setMin(e.target.value)} inputMode="decimal" required disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-max-${policy.id}`}>Maximum (%)</FieldLabel><Input id={`policy-correction-max-${policy.id}`} value={max} onChange={e=>setMax(e.target.value)} inputMode="decimal" required disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-target-${policy.id}`}>Target (%) (optional)</FieldLabel><Input id={`policy-correction-target-${policy.id}`} value={target} onChange={e=>setTarget(e.target.value)} inputMode="decimal" disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-source-${policy.id}`}>Source</FieldLabel><Input id={`policy-correction-source-${policy.id}`} value={source} onChange={e=>setSource(e.target.value)} maxLength={500} required disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-notes-${policy.id}`}>Notes (optional)</FieldLabel><Textarea id={`policy-correction-notes-${policy.id}`} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} disabled={locked}/></Field>
   <Field><FieldLabel htmlFor={`policy-correction-reason-${policy.id}`}>Reason</FieldLabel><Input id={`policy-correction-reason-${policy.id}`} value={reason} onChange={e=>setReason(e.target.value)} maxLength={450} required disabled={locked}/></Field>
   <div><Button disabled={locked}>Review correction</Button></div>
  </FieldGroup></form>}
  <div><Button type="button" variant="outline" disabled={busy} onClick={()=>void loadHistory()}>Load correction history</Button></div>
  {history&&(history.length?<ul>{history.map(h=><li key={h.id}>{h.createdAt} UTC · {h.oldClass!==null&&<>{h.oldClass} → {h.newClass} · {h.oldEffectiveDate} → {h.newEffectiveDate} · </>}{percent(h.oldMin) || '—'}–{percent(h.oldMax) || '—'}% to {percent(h.newMin)}–{percent(h.newMax)}% · target {percent(h.oldTarget)||'none'} to {percent(h.newTarget)||'none'}% · source: {h.oldSource || 'none'} → {h.newSource} · notes: {h.oldNotes || 'none'} → {h.newNotes || 'none'} · reason: {h.reason} · recorded by {h.createdBy}</li>)}</ul>:<p>No corrections recorded.</p>)}
 </div></details>
}
