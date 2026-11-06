import { confirmAction } from '#/components/confirmation-host'
import { formatJournalDescription } from '#/lib/journal-description'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { PendingRequestNotice, usePendingRequest } from '#/lib/pending-requests/use-pending'
import { getSession } from '#/lib/auth.functions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NativeSelect } from '#/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { createAccountFn, listLedgerFn, postManualJournalFn, reverseManualJournalFn } from '#/server/accounting/functions'

export const Route=createFileRoute('/accounting')({
  beforeLoad:async()=>{const session=await getSession();if(!session) throw redirect({to:'/login'});return {userId:session.user.id}},
  loader:async()=>{try{return {data:await listLedgerFn(),available:true}}catch{return {data:null,available:false}}},
  pendingComponent:()=> <main className="dashboard" role="status">Loading ledger…</main>,
  component:Accounting,
})
type Line={accountId:string;side:'debit'|'credit';amount:string}
type AccountRequest={idempotencyKey:string;code:string;name:string;currency:string}
type JournalRequest={idempotencyKey:string;currency:string;effectiveDate:string;description:string;lines:{accountId:string;side:'debit'|'credit';amountMinor:number}[]}
type ReversalRequest={idempotencyKey:string;entryId:string;effectiveDate:string;reason:string}
const blankLines=():Line[]=>[{accountId:'',side:'debit',amount:''},{accountId:'',side:'credit',amount:''}]
function Accounting(){
 const {data,available}=Route.useLoaderData(), router=useRouter()
 const {userId}=Route.useRouteContext()
 const accountPending=usePendingRequest<AccountRequest>(userId,'accounting-account')
 const journalPending=usePendingRequest<JournalRequest>(userId,'accounting-journal')
 const reversalPending=usePendingRequest<ReversalRequest>(userId,'accounting-reversal')
 const [code,setCode]=useState(''),[name,setName]=useState(''),[accountCurrency,setAccountCurrency]=useState('UGX')
 const [currency,setCurrency]=useState('UGX'),[date,setDate]=useState(''),[description,setDescription]=useState(''),[lines,setLines]=useState<Line[]>(blankLines)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 function changeLine(index:number,patch:Partial<Line>){setLines(previous=>previous.map((line,i)=>i===index?{...line,...patch}:line))}
 const unavailable = <T extends {idempotencyKey:string}>(p:ReturnType<typeof usePendingRequest<T>>) => !p.ready || !!p.storageError || !!p.pending
 async function discard(p:{discard:()=>void}) { if (!await confirmAction('Discard this pending request? It may already have been saved. Check the ledger first; a new submission can create a duplicate.')) return; try {p.discard()} catch {setError('Could not discard the pending request. Check browser storage and the ledger.')} }
 async function recordAccount(payload:AccountRequest,isNew:boolean) {
  setBusy(true);setError('');setMessage('')
  try {await accountPending.send(payload,data=>createAccountFn({data}),isNew);setCode('');setName('');setMessage('Account added.');try{await router.invalidate()}catch{setMessage('Account saved. Refresh to update the ledger.')}}
  catch{setError('Could not confirm this account. Check the ledger, then retry the saved request unchanged.')}finally{setBusy(false)}
 }
 async function addAccount(e:React.FormEvent){e.preventDefault();await recordAccount({idempotencyKey:crypto.randomUUID(),code,name,currency:accountCurrency},true)}
 async function recordJournal(payload:JournalRequest,isNew:boolean) {
  setBusy(true);setError('');setMessage('')
  try{await journalPending.send(payload,({idempotencyKey,...data})=>postManualJournalFn({data:{...data,requestId:idempotencyKey}}),isNew);setDescription('');setLines(blankLines());setMessage('Journal posted.');try{await router.invalidate()}catch{setMessage('Journal saved. Refresh to update the ledger.')}}
  catch{setError('Journal was not confirmed. Check the ledger, then retry the saved request unchanged.')}finally{setBusy(false)}
 }
 async function post(e:React.FormEvent){e.preventDefault();await recordJournal({idempotencyKey:crypto.randomUUID(),currency,effectiveDate:date,description,lines:lines.map(line=>({accountId:line.accountId,side:line.side,amountMinor:Number(line.amount)}))},true)}
 async function recordReversal(payload:ReversalRequest,isNew:boolean) {
  setBusy(true);setError('');setMessage('')
  try{await reversalPending.send(payload,({idempotencyKey,...data})=>reverseManualJournalFn({data:{...data,requestId:idempotencyKey}}),isNew);setMessage('Reversal posted.');try{await router.invalidate()}catch{setMessage('Reversal saved. Refresh to update the ledger.')}}
  catch{setError('Reversal was not confirmed. Check the ledger, then retry the saved request unchanged.')}finally{setBusy(false)}
 }
 return <div className="app"><header><Link to="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet" style={{textDecoration:'none'}}>Back to overview</Link></header><main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Accounting ledger</h1><p className="lead">Maintain accounts and post balanced manual journals.</p>{!available||!data?<Alert variant="destructive" role="alert"><AlertDescription>The ledger is unavailable or you do not have permission to view it.</AlertDescription></Alert>:<><p>Posted entries cannot be edited. The organisation’s account mappings and financial policies still need approval.</p>{error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message&&<p role="status">{message}</p>}<Card className="mt-7"><CardHeader><CardTitle><h2>Add account</h2></CardTitle></CardHeader><CardContent><PendingRequestNotice title="Account" pending={accountPending.pending} storageError={accountPending.storageError} disabled={busy} onRetry={()=>{if(accountPending.pending) void recordAccount(accountPending.pending,false)}} onDiscard={()=>discard(accountPending)}/><form onSubmit={addAccount} style={{display:'grid',gap:16,maxWidth:620}}><label className="flex flex-col gap-2">Account code<Input value={code} onChange={e=>setCode(e.target.value)} required maxLength={40}/></label><label className="flex flex-col gap-2">Account name<Input value={name} onChange={e=>setName(e.target.value)} required maxLength={200}/></label><label className="flex flex-col gap-2">Account currency<Input value={accountCurrency} onChange={e=>setAccountCurrency(e.target.value.toUpperCase())} required pattern="[A-Z]{3}" maxLength={3}/></label><Button disabled={busy||unavailable(accountPending)}>Add account</Button></form></CardContent></Card><Card className="mt-7"><CardHeader><CardTitle><h2>Post manual journal</h2></CardTitle></CardHeader><CardContent><PendingRequestNotice title="Manual journal" pending={journalPending.pending} storageError={journalPending.storageError} disabled={busy} onRetry={()=>{if(journalPending.pending) void recordJournal(journalPending.pending,false)}} onDiscard={()=>discard(journalPending)}/><p>Enter whole minor units. Total debits must equal total credits, and each account must use the journal currency.</p><form onSubmit={post} style={{display:'grid',gap:16}}><label className="flex flex-col gap-2">Journal currency<Input value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} required pattern="[A-Z]{3}" maxLength={3}/></label><label className="flex flex-col gap-2">Effective date<DatePickerInput type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label className="flex flex-col gap-2">Description<Input value={description} onChange={e=>setDescription(e.target.value)} required maxLength={500}/></label>{lines.map((line,i)=><fieldset key={i} className="flex flex-col gap-4 rounded-md border p-4"><legend>Line {i+1}</legend><label className="flex flex-col gap-2">Account<NativeSelect className="w-full" value={line.accountId} onChange={e=>changeLine(i,{accountId:e.target.value})} required><option value="">Select account</option>{data.accounts.filter(a=>a.currency===currency).map(a=><option key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</option>)}</NativeSelect></label><label className="flex flex-col gap-2">Side<NativeSelect className="w-full" value={line.side} onChange={e=>changeLine(i,{side:e.target.value as Line['side']})}><option value="debit">Debit</option><option value="credit">Credit</option></NativeSelect></label><label className="flex flex-col gap-2">Amount (minor units)<Input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={line.amount} onChange={e=>changeLine(i,{amount:e.target.value})} required/></label>{lines.length>2&&<Button variant="outline" type="button" onClick={()=>setLines(current=>current.filter((_,j)=>i!==j))}>Remove line</Button>}</fieldset>)}<Button variant="outline" type="button" onClick={()=>setLines(current=>[...current,{accountId:'',side:'debit',amount:''}])} disabled={lines.length>=100}>Add line</Button><Button disabled={busy||data.accounts.length<2||unavailable(journalPending)}>{busy?'Posting…':'Post journal'}</Button></form></CardContent></Card><section style={{marginTop:40}}><h2>Chart of accounts ({data.accounts.length})</h2>{data.accounts.length===0?<p>No accounts added yet.</p>:<ul>{data.accounts.map(a=><li key={a.id}>{a.code} — {a.name} ({a.currency})</li>)}</ul>}</section><section style={{marginTop:40}}><h2>Posted journals ({data.entries.length})</h2><PendingRequestNotice title="Journal reversal" pending={reversalPending.pending} storageError={reversalPending.storageError} disabled={busy} onRetry={()=>{if(reversalPending.pending) void recordReversal(reversalPending.pending,false)}} onDiscard={()=>discard(reversalPending)}/>{data.entries.length===0?<p>No journals posted yet.</p>:data.entries.map(entry=><Card key={entry.id} className="mt-7"><CardHeader><CardTitle><h3>{formatJournalDescription(entry.sourceType, entry.description)}</h3></CardTitle></CardHeader><CardContent><p>{entry.effectiveDate} · {entry.currency} · recorded {entry.createdAt} · by {entry.createdBy}{entry.reversesEntryId?` · reverses ${entry.reversesEntryId}`:''}</p><Table><TableHeader><TableRow><TableHead scope="col">Account</TableHead><TableHead scope="col">Side</TableHead><TableHead scope="col">Amount (minor units)</TableHead></TableRow></TableHeader><TableBody>{entry.lines.map((line,i)=><TableRow key={i}><TableCell>{line.accountCode} — {line.accountName}</TableCell><TableCell>{line.side}</TableCell><TableCell>{line.amountMinor.toLocaleString('en-US')}</TableCell></TableRow>)}</TableBody></Table>{entry.reversedById ? <p>Reversed by journal {entry.reversedById}.</p> : entry.sourceType === 'manual' ? <ReversalForm entryId={entry.id} earliestDate={entry.effectiveDate} disabled={busy||unavailable(reversalPending)} onRecord={payload=>recordReversal(payload,true)}/> : null}</CardContent></Card>)}</section></>}</main></div>
}

function ReversalForm({entryId,earliestDate,disabled,onRecord}:{entryId:string;earliestDate:string;disabled:boolean;onRecord:(payload:ReversalRequest)=>Promise<void>}) {
 const [date,setDate]=useState(''),[reason,setReason]=useState('')
 async function submit(e:React.FormEvent){e.preventDefault();await onRecord({idempotencyKey:crypto.randomUUID(),entryId,effectiveDate:date,reason})}
 return <details><summary>Reverse this journal</summary><p>The original remains in the ledger. An exact offsetting journal will be posted on or after the original date.</p><form onSubmit={submit} style={{display:'grid',gap:12,maxWidth:480}}><label className="flex flex-col gap-2">Reversal date<DatePickerInput type="date" required min={earliestDate} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="flex flex-col gap-2">Reason<Input required maxLength={450} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={disabled}>Post reversal</Button></form></details>
}
