import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { listLoanTermsFn, recordLoanTermsFn } from '#/server/loan-terms/functions'
import { LoanTermVoid } from '#/components/loan-term-void'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'

export const Route = createFileRoute('/loan-terms')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { const session = await getSession(); if (!session) throw redirect({to:'/login'}); return {userId:session.user.id} }, async () => listLoanTermsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: LoanTerms,
})
type Data=NonNullable<Awaited<ReturnType<typeof listLoanTermsFn>>>
type Loan=Data['loans'][number]
type Request={loanId:string;expectedMemberId:string;expectedMemberNumber:string;expectedMemberName:string;expectedPrincipalMinor:string;expectedCurrency:string;expectedDisbursementDate:string;expectedMaturityDate:string|null;expectedOriginalTerms:string;effectiveDate:string;terms:string;reason:string;source:string;idempotencyKey:string}
const amount=(value:string)=>BigInt(value).toLocaleString('en-US')
const loanLabel=(l:Loan)=>`${l.memberName} · ${l.memberNumber} · ${l.currency} ${amount(l.principalMinor)} minor units · disbursed ${l.disbursementDate} · loan ${l.id}`
function LoanTerms(){
 const data=Route.useLoaderData(),{userId}=Route.useRouteContext(),router=useRouter()
 const pending=usePendingRequest<Request>(userId,'loan-term-change')
 const [loanId,setLoanId]=useState(''),[effectiveDate,setEffectiveDate]=useState(''),[terms,setTerms]=useState(''),[reason,setReason]=useState(''),[source,setSource]=useState('')
 const [review,setReview]=useState<Request|null>(null),[busy,setBusy]=useState(false),[refreshFailed,setRefreshFailed]=useState(false),[discardReview,setDiscardReview]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const loan=data?.loans.find(l=>l.id===loanId)
 const locked=busy||refreshFailed||!pending.ready||!!pending.pending||!!pending.storageError
 function prepare(event:React.FormEvent){event.preventDefault();setError('');setMessage('');if(!loan||!effectiveDate||effectiveDate<loan.disbursementDate||!terms.trim()||!reason.trim()||!source.trim()){setError('Select a loan and enter a valid effective date, terms, reason and source.');return}setReview({loanId:loan.id,expectedMemberId:loan.memberId,expectedMemberNumber:loan.memberNumber,expectedMemberName:loan.memberName,expectedPrincipalMinor:loan.principalMinor,expectedCurrency:loan.currency,expectedDisbursementDate:loan.disbursementDate,expectedMaturityDate:loan.maturityDate,expectedOriginalTerms:loan.terms,effectiveDate,terms:terms.trim(),reason:reason.trim(),source:source.trim(),idempotencyKey:crypto.randomUUID()})}
 async function send(request:Request,isNew:boolean){setBusy(true);setError('');setMessage('');try{let voided=false;await pending.send(request,async p=>{const result=await recordLoanTermsFn({data:{...p,requestKey:p.idempotencyKey}});voided=result.voided},isNew);setReview(null);setTerms('');setReason('');setSource('');setEffectiveDate('');setMessage(voided?'This previously recorded change has since been voided.':'Loan term change recorded. No balance or interest was calculated.');try{await router.invalidate()}catch{setRefreshFailed(true);setError('The change was recorded, but the list could not refresh. Reload before recording another change.')}}catch{setError('The change could not be confirmed. Check the history and loan; if reviewed details changed, discard the retained request and review again. Otherwise retry it unchanged.')}finally{setBusy(false)}}
 return <div className="app">
  <header><Link to="/" className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans and credit bookings</Link></header>
  <main className="dashboard flex flex-col gap-6">
   <div><p className="eyebrow">KANUNGU LOAN FUND · ADMINISTRATION</p><h1>Loan term changes</h1><p className="lead">Record agreed changes to an individual loan and keep its original terms in history.</p></div>
   {!data ? <Alert variant="destructive" role="alert"><AlertDescription>Loan terms are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
    <Alert><AlertDescription>This records a source fact; it does not calculate interest, allocate repayments or update balances. The linked borrower can see non-void changes, including future-dated changes. The app does not determine the order or combined effect of changes on the same date.</AlertDescription></Alert>
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
    <PendingRequestNotice title="Loan term change" pending={pending.pending} storageError={pending.storageError} disabled={busy||refreshFailed} onRetry={()=>pending.pending&&void send(pending.pending,false)} onDiscard={()=>setDiscardReview(true)}/>
    {discardReview && <Alert role="region" aria-label="Confirm discarding request"><AlertDescription className="flex flex-col gap-3"><p>The request may already have been recorded. Check the loan history before discarding.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>{try{pending.discard();setDiscardReview(false)}catch{setError('The pending request could not be discarded.')}}}>Discard request</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setDiscardReview(false)}>Keep request</Button></div></AlertDescription></Alert>}
    <Card><CardHeader><CardTitle role="heading" aria-level={2}>Record a change</CardTitle><CardDescription>Choose a loan, enter the agreed terms and review them before recording.</CardDescription></CardHeader><CardContent>
     {review ? <section aria-label="Review loan term change" className="flex flex-col gap-3"><h2>Review loan term change</h2><p><strong>{review.expectedMemberName} · {review.expectedMemberNumber}</strong></p><p>Loan {review.loanId} · {review.expectedCurrency} {amount(review.expectedPrincipalMinor)} minor units original principal · disbursed {review.expectedDisbursementDate} · maturity {review.expectedMaturityDate||'not recorded'}</p><p>Originally recorded terms: {review.expectedOriginalTerms}</p><p>Effective date: <strong>{review.effectiveDate}</strong></p><p>Changed terms: {review.terms}</p><p>Reason: {review.reason}</p><p>Source: {review.source}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={()=>void send(review,true)}>{busy ? <SpinnerLabel>Record reviewed change</SpinnerLabel> : 'Record reviewed change'}</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setReview(null)}>Edit</Button></div></section> :
     <form onSubmit={prepare} className="max-w-2xl"><FieldGroup>
      <Field><FieldLabel htmlFor="term-loan">Loan</FieldLabel><NativeSelect id="term-loan" required value={loanId} disabled={locked} onChange={e=>{setLoanId(e.target.value);setEffectiveDate('');setError('');setMessage('')}}><option value="">Select a loan</option>{data.loans.map(l=><option key={l.id} value={l.id}>{loanLabel(l)}</option>)}</NativeSelect></Field>
      {loan && <><p>Originally recorded terms: {loan.terms}</p>
       <Field><FieldLabel htmlFor="term-date">Effective date</FieldLabel><DatePickerInput id="term-date" type="date" required min={loan.disbursementDate} value={effectiveDate} disabled={locked} onChange={e=>setEffectiveDate(e.target.value)}/></Field>
       <Field><FieldLabel htmlFor="term-terms">Agreed changed terms</FieldLabel><Textarea id="term-terms" required maxLength={4000} value={terms} disabled={locked} onChange={e=>setTerms(e.target.value)}/></Field>
       <Field><FieldLabel htmlFor="term-reason">Reason</FieldLabel><Textarea id="term-reason" required maxLength={450} value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/></Field>
       <Field><FieldLabel htmlFor="term-source">Source or supporting evidence</FieldLabel><Textarea id="term-source" required maxLength={450} value={source} disabled={locked} onChange={e=>setSource(e.target.value)}/></Field></>}
      <Button disabled={locked||!loan}>Review term change</Button>
     </FieldGroup></form>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle role="heading" aria-level={2}>Recorded term changes ({data.changes.length})</CardTitle><CardDescription>Original records and any voids remain available for review.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{!data.changes.length ? <p>No term changes recorded.</p> : data.changes.map(c=><article key={c.id} className="flex flex-col gap-2 rounded-md border p-4"><h3>{c.memberName} · {c.memberNumber}</h3><p>Loan {c.loanId} · effective {c.effectiveDate}</p><p>Terms: {c.terms}</p><p>Reason: {c.reason||'not recorded'} · source: {c.source||'not recorded'}</p><p className="text-sm text-muted-foreground">Recorded {c.createdAt} UTC by {c.createdBy} · change {c.id}</p>{c.voidedAt ? <p><Badge variant="secondary">Voided</Badge> {c.voidedAt} UTC: {c.voidReason}</p> : c.loanVoidedAt ? <p>Change not voided</p> : <LoanTermVoid changeId={c.id} loanId={c.loanId} terms={c.terms} effectiveDate={c.effectiveDate} userId={userId}/>} {c.loanVoidedAt && <p>Loan voided {c.loanVoidedAt} UTC: {c.loanVoidReason}</p>}</article>)}</CardContent></Card>
   </>}
  </main>
 </div>
}
