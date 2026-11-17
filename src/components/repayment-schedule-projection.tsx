import { SpinnerLabel } from '#/components/ui/spinner'
import {useState} from 'react'
import {Alert,AlertDescription} from '#/components/ui/alert'
import {Button} from '#/components/ui/button'
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '#/components/ui/card'
import {DatePickerInput} from '#/components/ui/date-picker'
import {Field,FieldGroup,FieldLabel} from '#/components/ui/field'
import {Input} from '#/components/ui/input'
import {NativeSelect,NativeSelectOption} from '#/components/ui/native-select'
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '#/components/ui/table'
import {projectLoanScheduleFn} from '#/server/loan-billing/functions'

const money=(value:string)=>BigInt(value).toLocaleString('en-US')
type Result=Awaited<ReturnType<typeof projectLoanScheduleFn>>

export function RepaymentScheduleProjection({loanId,revision,disabled}:{loanId:string;revision:number;disabled:boolean}){
 const [asOfDate,setAsOf]=useState(''),[firstDueDate,setFirst]=useState(''),[cadence,setCadence]=useState('1'),[count,setCount]=useState('6'),[style,setStyle]=useState<'end'|'equal'>('end')
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const changed=()=>{setResult(null);setError('')}
 async function submit(e:React.FormEvent){e.preventDefault();changed();setBusy(true);try{setResult(await projectLoanScheduleFn({data:{loanId,asOfDate,firstDueDate,cadenceMonths:Number(cadence),installments:Number(count),principalStyle:style}}))}catch(e){setError(e instanceof Error?e.message:'The forecast could not be calculated.')}finally{setBusy(false)}}
 const stale=!!result&&result.revision!==revision
 return <Card className="mt-6"><CardHeader><CardTitle>Projected repayment schedule</CardTitle><CardDescription>Explore a possible repayment plan using the configured provisional billing rules.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
  <Alert><AlertDescription>This is a forecast, not a demand, approved repayment agreement, or record of payments. It assumes each projected payment is made in full on its listed date and applies it to interest before principal. It uses actual-day interest, reviewed rate changes and the original 60-day minimum. Installment dates and principal style below are planning choices; confirm them against the agreement. Calculated unpaid interest as of the review date, including any unposted accrual, is carried into the first projected payment. The first projected date must be later than the review date.</AlertDescription></Alert>
  <form onSubmit={submit}><FieldGroup>
   <Field><FieldLabel htmlFor="forecast-as-of">Review balances as of</FieldLabel><DatePickerInput id="forecast-as-of" required value={asOfDate} disabled={disabled||busy} onChange={e=>{setAsOf(e.target.value);changed()}} /></Field>
   <Field><FieldLabel htmlFor="forecast-first">First projected payment date</FieldLabel><DatePickerInput id="forecast-first" required min={asOfDate||undefined} value={firstDueDate} disabled={disabled||busy} onChange={e=>{setFirst(e.target.value);changed()}} /></Field>
   <Field><FieldLabel htmlFor="forecast-cadence">Payment interval</FieldLabel><NativeSelect id="forecast-cadence" value={cadence} disabled={disabled||busy} onChange={e=>{setCadence(e.target.value);changed()}}><NativeSelectOption value="1">Every month</NativeSelectOption><NativeSelectOption value="2">Every two months</NativeSelectOption><NativeSelectOption value="6">Every six months</NativeSelectOption></NativeSelect></Field>
   <Field><FieldLabel htmlFor="forecast-count">Number of projected payments</FieldLabel><Input id="forecast-count" type="number" min={1} max={120} step={1} required value={count} disabled={disabled||busy} onChange={e=>{setCount(e.target.value);changed()}} /></Field>
   <Field><FieldLabel htmlFor="forecast-style">Principal plan</FieldLabel><NativeSelect id="forecast-style" value={style} disabled={disabled||busy} onChange={e=>{setStyle(e.target.value as 'end'|'equal');changed()}}><NativeSelectOption value="end">Principal at final payment</NativeSelectOption><NativeSelectOption value="equal">Equal principal over payments</NativeSelectOption></NativeSelect></Field>
   <div><Button disabled={disabled||busy}>{busy ? <SpinnerLabel>Calculate forecast</SpinnerLabel> : 'Calculate forecast'}</Button></div>
  </FieldGroup></form>
  {error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
  {result&&<section aria-live="polite" className="space-y-3"><h3>Hypothetical plan from {result.asOfDate}</h3>{stale&&<Alert variant="destructive"><AlertDescription>Loan records changed. Calculate again before relying on this forecast.</AlertDescription></Alert>}<p>Starting principal: {result.currency} {money(result.startingPrincipalMinor)} minor units. Calculated unpaid interest as of the review date, including any unposted accrual: {money(result.startingInterestDueMinor)} minor units. Future changes to the loan or its records require recalculation.</p><p>Projected interest payments including carried unpaid interest: {money(result.totalInterestMinor)} · projected principal: {money(result.totalPrincipalMinor)} · projected total: {money(result.totalPaymentMinor)} minor units.</p><Table><TableHeader><TableRow><TableHead>Projected date</TableHead><TableHead>Interest</TableHead><TableHead>Principal</TableHead><TableHead>Payment</TableHead><TableHead>Remaining principal</TableHead><TableHead>Remaining interest</TableHead></TableRow></TableHeader><TableBody>{result.rows.map(row=><TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell>{money(row.interestMinor)}</TableCell><TableCell>{money(row.principalMinor)}</TableCell><TableCell>{money(row.paymentMinor)}</TableCell><TableCell>{money(row.remainingPrincipalMinor)}</TableCell><TableCell>{money(row.remainingInterestMinor)}</TableCell></TableRow>)}</TableBody></Table><p>All amounts are minor units. Dates beyond a month’s last day use that month’s last day; the original day is restored in longer months. This forecast is not saved or posted.</p></section>}
 </CardContent></Card>
}
