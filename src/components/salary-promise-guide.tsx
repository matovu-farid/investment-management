import {useState} from 'react'
import {Alert,AlertDescription} from '#/components/ui/alert'
import {Button} from '#/components/ui/button'
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '#/components/ui/card'
import {Field,FieldGroup,FieldLabel} from '#/components/ui/field'
import {Input} from '#/components/ui/input'
import {salaryPromiseGuide} from '#/lib/credit-review/salary-promise'

export function SalaryPromiseGuide(){
 const [issued,setIssued]=useState(''),[promised,setPromised]=useState(''),[result,setResult]=useState<ReturnType<typeof salaryPromiseGuide>|null>(null),[error,setError]=useState('')
 const reset=()=>{setResult(null);setError('')}
 function calculate(e:React.FormEvent){e.preventDefault();try{setResult(salaryPromiseGuide(issued.trim(),promised.trim()));setError('')}catch(e){setResult(null);setError(e instanceof Error?e.message:'Unable to calculate.') }}
 return <Card className="mt-6"><CardHeader><CardTitle>Salaried borrower promise guide</CardTitle><CardDescription>Compare a proposed monthly promise with the processing guidance in the 2025 credit protocol.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
 <Alert><AlertDescription>Page 1 describes at least 1.5% of issued credit per month for salaried borrowers. The risk table on page 4 separately refers to 5% of outstanding; confirm which rule applies. This guide does not assess affordability, approve a loan or create a repayment schedule.</AlertDescription></Alert>
 <form onSubmit={calculate}><FieldGroup><Field><FieldLabel htmlFor="salary-issued">Issued credit (minor units)</FieldLabel><Input id="salary-issued" inputMode="numeric" required value={issued} onChange={e=>{setIssued(e.target.value);reset()}} /></Field><Field><FieldLabel htmlFor="salary-promise">Proposed monthly promise (same currency, minor units)</FieldLabel><Input id="salary-promise" inputMode="numeric" required value={promised} onChange={e=>{setPromised(e.target.value);reset()}} /></Field><div><Button>Compare promise</Button></div></FieldGroup></form>
 {error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
 {result&&<div role="status"><p>Indicative 1.5% minimum: {BigInt(result.minimumMinor).toLocaleString('en-US')} minor units per month. The proposed promise is {result.meetsMinimum?'at or above':'below'} this amount.</p><p>Rounded up to the next whole minor unit; this rounding is an implementation assumption to confirm with the GM.</p></div>}
 </CardContent></Card>
}
