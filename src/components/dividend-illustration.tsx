import {useState} from 'react'
import {dividendIllustration} from '#/lib/dividend-illustration'
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '#/components/ui/card'
import {Alert,AlertDescription} from '#/components/ui/alert'
import {Input} from '#/components/ui/input'
import {Field,FieldLabel} from '#/components/ui/field'

const amount=(v:string)=>BigInt(v).toLocaleString('en-US')
export function DividendIllustration(){
 const [income,setIncome]=useState('')
 let result:ReturnType<typeof dividendIllustration>|null=null,error=''
 if(income){try{result=dividendIllustration(income)}catch(e){error=e instanceof Error?e.message:'Check the amount.'}}
 return <Card className="mt-6"><CardHeader><CardTitle>Dividend policy comparison</CardTitle><CardDescription>Compare the two percentages described in the supplied records.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
  <Alert><AlertDescription>The 2025 investment policy describes 30% of net income (p. 2). The 2026 board pack reports a 40% policy decided at the 11th AGM through 2030 (p. 22). Confirm the applicable AGM resolution, income basis and eligibility before declaring or paying a dividend.</AlertDescription></Alert>
  <p>This unsaved illustration applies each percentage to the same manually entered non-negative net-income figure, rounding down to whole UGX. The later board-pack percentage is a provisional comparison, not proof that this income figure is the approved distribution base. It does not allocate to members, record a liability, approve a dividend or post accounting entries.</p>
  <Field><FieldLabel htmlFor="dividend-income">Illustrative net income (UGX)</FieldLabel><Input id="dividend-income" inputMode="numeric" value={income} maxLength={16} onChange={e=>setIncome(e.target.value)}/></Field>
  {error&&<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
  {result&&<div aria-live="polite"><p>2025 IPS illustration at 30%: <strong>UGX {amount(result.ips)}</strong></p><p>2026 board-pack illustration at 40%: <strong>UGX {amount(result.board)}</strong></p></div>}
 </CardContent></Card>
}
