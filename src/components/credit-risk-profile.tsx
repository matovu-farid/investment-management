import { SpinnerLabel } from '#/components/ui/spinner'
import { creditEarlyWarning, creditEarlyWarningLabel } from '#/lib/installment-tracking/early-warning'
import { useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { DatePickerInput } from '#/components/ui/date-picker'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { reviewCreditRiskFn } from '#/server/credit-risk/functions'
import { mergeRiskPages } from '#/lib/installment-tracking/risk-pages'
import { creditRiskCsv } from '#/lib/installment-tracking/risk-export'

type Result=Awaited<ReturnType<typeof reviewCreditRiskFn>>
const names:Record<string,string>={smooth:'Smooth (no overdue as of date)',mild:'Mild risk',risky:'Risky','very-risky':'Very risky',review:'Requires review',unknown:'Unknown'}
const amount=(value:string)=>BigInt(value).toLocaleString('en-US')

export function CreditRiskProfile({currencies}:{currencies:string[]}){
 const [currency,setCurrency]=useState(''),[asOfDate,setAsOfDate]=useState(''),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('')
 async function review(event:FormEvent){event.preventDefault();setBusy(true);setError('');setResult(null);setProgress('');try{
  let offset=0,fingerprint:string|undefined,combined:Result|null=null
  do{
   const page:Result=await reviewCreditRiskFn({data:{currency,asOfDate,offset,expectedFingerprint:fingerprint}})
   fingerprint??=page.fingerprint
   if(!combined)combined=page
   else combined=mergeRiskPages(combined,page)
   setProgress(`Reviewed ${combined.eligibleCount} of ${page.totalEligible} recorded loans.`)
   if(page.nextOffset===null){if(combined.eligibleCount!==page.totalEligible)throw new Error('Profile incomplete');break}
   if(page.nextOffset<=offset)throw new Error('Invalid profile continuation')
   offset=page.nextOffset
  }while(true)
  setResult(combined)
 }catch{setError('The profile could not be calculated, or its sources changed during review. Check the date and access, then try again.')}finally{setBusy(false);setProgress('')}}
 function download(){if(!result)return;const url=URL.createObjectURL(new Blob([creditRiskCsv(result)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`rnig-credit-risk-${result.asOfDate}-${result.currency}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <Card className="mt-6"><CardHeader><CardTitle>Credit-book risk profile</CardTitle><CardDescription>Review a provisional amount-based profile of recorded member credit.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
  <Alert><AlertDescription>Amounts use provisional calculated principal plus accrued unpaid interest. Risk comes from the latest reviewed installment schedule and current records; it is not an approved historical score. Smooth means no overdue installment at the selected date; it does not establish consistently timely payments. Loans without a calculable balance are excluded from the amounts and counted below. Unknown or review-needed risk remains in the denominator. This does not freeze loans, authorize recovery or establish a complete reconciled book.</AlertDescription></Alert>
  <form onSubmit={review}><FieldGroup><Field><FieldLabel htmlFor="risk-currency">Currency</FieldLabel><NativeSelect id="risk-currency" required value={currency} disabled={busy} onChange={e=>{setCurrency(e.target.value);setResult(null)}}><NativeSelectOption value="">Select currency</NativeSelectOption>{currencies.map(c=><NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="risk-date">As-of date</FieldLabel><DatePickerInput id="risk-date" required value={asOfDate} disabled={busy} onChange={e=>{setAsOfDate(e.target.value);setResult(null)}} /></Field><div><Button disabled={busy||!currency||!asOfDate}>{busy ? <SpinnerLabel>Calculate risk profile</SpinnerLabel> : 'Calculate risk profile'}</Button></div></FieldGroup></form>
  {progress&&<p role="status">{progress}</p>}
  {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  {result&&<section aria-label="Credit risk profile result" className="flex flex-col gap-3"><h3>Selected recorded credit as of {result.asOfDate}</h3><div><Button type="button" variant="outline" onClick={download}>Download risk profile CSV</Button></div><p>Import columns as text to preserve large amounts and identifiers. Protective apostrophes may appear.</p><p>{result.includedCount} of {result.eligibleCount} eligible recorded loans have a calculable balance; {result.unavailableLoanIds.length} require balance review. Amounts are {result.currency} minor units; total included: {amount(result.totalMinor)}. Unknown and review-needed: {amount(result.unclassifiedMinor)}.</p><p>Sources were read between {result.startedAt} and {result.finishedAt} UTC. They were read separately, not as one atomic snapshot. Recalculate after changes.</p><Alert><AlertDescription><strong>10% early-warning screen:</strong> {creditEarlyWarningLabel[creditEarlyWarning(result)]} The policy does not specify the denominator; this provisional screen uses principal plus accrued unpaid interest in the selected currency. It does not establish a complete reconciled book or automatically tighten credit.</AlertDescription></Alert><p className="text-sm text-muted-foreground">Scroll horizontally if needed to see all risk columns.</p><Table containerProps={{tabIndex:0,role:"region", "aria-label":"Credit risk table"}}><TableHeader><TableRow><TableHead>Provisional risk</TableHead><TableHead>Loans</TableHead><TableHead>Included amount</TableHead><TableHead>Share of included amount</TableHead></TableRow></TableHeader><TableBody>{result.bands.map(b=><TableRow key={b.risk}><TableCell>{names[b.risk]}</TableCell><TableCell>{b.loanCount}</TableCell><TableCell>{amount(b.amountMinor)}</TableCell><TableCell>{b.basisPoints===null?'—':`${(Number(b.basisPoints)/100).toFixed(2)}%`}</TableCell></TableRow>)}</TableBody></Table>{result.unavailableLoanIds.length>0&&<p>Loans needing balance review: {result.unavailableLoanIds.join(', ')}.</p>}</section>}
 </CardContent></Card>
}
