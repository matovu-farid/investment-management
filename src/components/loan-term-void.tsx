import {useState} from 'react'
import {useRouter} from '@tanstack/react-router'
import {PendingRequestNotice,usePendingRequest} from '#/lib/pending-requests/use-pending'
import {voidLoanTermFn} from '#/server/loan-term-void/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
type Request={changeId:string;reason:string;idempotencyKey:string}
export function LoanTermVoid({changeId,loanId,terms,effectiveDate,userId}:{changeId:string;loanId:string;terms:string;effectiveDate:string;userId:string}){
 const router=useRouter(),pending=usePendingRequest<Request>(userId,`loan-term-void:${changeId}`)
 const [reason,setReason]=useState(''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[refreshFailed,setRefreshFailed]=useState(false),[discard,setDiscard]=useState(false)
 async function send(value:Request,isNew:boolean){setBusy(true);setError('');setMessage('');try{await pending.send(value,v=>voidLoanTermFn({data:{changeId:v.changeId,reason:v.reason,requestKey:v.idempotencyKey}}),isNew);setMessage('Term change voided.');setReview(false);try{await router.invalidate()}catch{setRefreshFailed(true);setError('The void was recorded, but the page could not refresh. Reload before continuing.')}}catch{setError('The void could not be confirmed. Check history and retry the retained request unchanged.')}finally{setBusy(false)}}
 const locked=busy||refreshFailed||!pending.ready||!!pending.pending||!!pending.storageError
 return <details className="mt-2"><summary className="cursor-pointer font-medium">Void incorrect term change</summary><div className="flex flex-col gap-3 pt-3"><p>Voiding retains the original change and a correction record. It removes the change from the member view; no interest or balance is recalculated.</p><PendingRequestNotice title="Term change void" pending={pending.pending} storageError={pending.storageError} disabled={busy||refreshFailed} onRetry={()=>pending.pending&&void send(pending.pending,false)} onDiscard={()=>setDiscard(true)}/>
 {discard&&<Alert role="region" aria-label="Confirm discard"><AlertDescription className="flex flex-col gap-3"><p>Check history before discarding: the request may already have been recorded.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>{try{pending.discard();setDiscard(false)}catch{setError('The pending request could not be discarded.')}}}>Discard request</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setDiscard(false)}>Keep request</Button></div></AlertDescription></Alert>}
 {error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message&&<Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
 {review?<section aria-label="Review term change void" className="flex flex-col gap-2"><p>Loan {loanId} · change {changeId} · effective {effectiveDate}</p><p>Recorded terms: {terms}</p><p>Reason for void: {reason.trim()}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={()=>void send({changeId,reason:reason.trim(),idempotencyKey:crypto.randomUUID()},true)}>Confirm void</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setReview(false)}>Edit</Button></div></section>:<form onSubmit={e=>{e.preventDefault();if(reason.trim())setReview(true)}} className="flex max-w-lg flex-col gap-3"><Field><FieldLabel htmlFor={`void-reason-${changeId}`}>Reason for void</FieldLabel><Input id={`void-reason-${changeId}`} value={reason} onChange={e=>setReason(e.target.value)} required maxLength={450} disabled={locked}/></Field><Button disabled={locked||!reason.trim()}>Review void</Button></form>}
 </div></details>
}
