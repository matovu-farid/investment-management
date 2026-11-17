import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { DatePickerInput } from '#/components/ui/date-picker'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { getSession } from '#/lib/auth.functions'
import { estimateLoanInterest } from '#/lib/loan-estimate/estimate'

export const Route = createFileRoute('/loan-estimate')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  component: LoanEstimate,
})

type Reduction = { id: string; date: string; amountMinor: string }
type Result = ReturnType<typeof estimateLoanInterest>
function LoanEstimate() {
  const [principal, setPrincipal] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState('')
  const [option, setOption] = useState('60'), [rounding, setRounding] = useState<'half-up' | 'down'>('half-up')
  const [reductions, setReductions] = useState<Reduction[]>([]), [result, setResult] = useState<Result | null>(null), [error, setError] = useState('')
  const invalidate = () => { setResult(null); setError('') }
  function calculate(e: React.FormEvent) {
    e.preventDefault(); setError(''); setResult(null)
    try {
      setResult(estimateLoanInterest({ principalMinor: principal, startDate: start, asOfDate: end, rateBasisPoints: option === '180' ? 500 : 200, periodDays: Number(option), principalReductions: reductions.map(({date, amountMinor}) => ({date, amountMinor})), rounding }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not calculate the estimate.') }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/loans" className="quiet">Back to loans and bookings</Link></header><main className="dashboard">
    <p className="eyebrow">KANUNGU LOAN FUND · WORKSHEET</p><h1>Estimate loan interest</h1>
    <Alert><AlertDescription>This working estimate uses the inputs below, not the recorded loan ledger. It does not post a journal, change a balance, or publish a member statement. Confirm the result against the GM's records before using it.</AlertDescription></Alert>
    <Card className="mt-6"><CardHeader><CardTitle>Calculation inputs</CardTitle><CardDescription>Use whole minor units for every amount. A principal reduction is the amount applied to principal, not an unallocated repayment.</CardDescription></CardHeader><CardContent>
      <form onSubmit={calculate}><FieldGroup>
        <Field><FieldLabel htmlFor="estimate-principal">Opening principal (minor units)</FieldLabel><Input id="estimate-principal" inputMode="numeric" required value={principal} onChange={e => {setPrincipal(e.target.value);invalidate()}} /></Field>
        <Field><FieldLabel htmlFor="estimate-start">Start date</FieldLabel><DatePickerInput id="estimate-start" required value={start} onChange={e => {setStart(e.target.value);invalidate()}} /></Field>
        <Field><FieldLabel htmlFor="estimate-end">End date (exclusive)</FieldLabel><DatePickerInput id="estimate-end" required value={end} onChange={e => {setEnd(e.target.value);invalidate()}} /></Field>
        <Field><FieldLabel htmlFor="estimate-rate">Rate and period</FieldLabel><NativeSelect id="estimate-rate" value={option} onChange={e => {setOption(e.target.value);invalidate()}}><NativeSelectOption value="60">2% per 60 days</NativeSelectOption><NativeSelectOption value="180">5% per 180 days</NativeSelectOption><NativeSelectOption value="30">2% per 30 days · credit above limit</NativeSelectOption></NativeSelect></Field>
        <Field><FieldLabel htmlFor="estimate-rounding">Final rounding</FieldLabel><NativeSelect id="estimate-rounding" value={rounding} onChange={e => {setRounding(e.target.value as 'half-up' | 'down');invalidate()}}><NativeSelectOption value="half-up">Round half up to a minor unit</NativeSelectOption><NativeSelectOption value="down">Round down to a minor unit</NativeSelectOption></NativeSelect></Field>
        <div><h3>Principal reductions</h3><p>Apply each reduction at the start of its date. Enter only amounts already assigned to principal.</p>{reductions.map((r, i) => <fieldset key={r.id} className="flex flex-wrap items-end gap-3"><legend>Reduction {i + 1}</legend><label>Date <DatePickerInput required value={r.date} onChange={e => {setReductions(old => old.map(x => x.id === r.id ? {...x,date:e.target.value} : x));invalidate()}} /></label><label>Amount (minor units) <Input required inputMode="numeric" value={r.amountMinor} onChange={e => {setReductions(old => old.map(x => x.id === r.id ? {...x,amountMinor:e.target.value} : x));invalidate()}} /></label><Button type="button" variant="outline" onClick={() => {setReductions(old => old.filter(x => x.id !== r.id));invalidate()}}>Remove reduction {i + 1}</Button></fieldset>)}<Button type="button" variant="outline" onClick={() => {setReductions(old => [...old,{id:crypto.randomUUID(),date:'',amountMinor:''}]);invalidate()}}>Add principal reduction</Button></div>
        <div><Button type="submit">Calculate estimate</Button></div>
      </FieldGroup></form>
      {error && <Alert variant="destructive" role="alert" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
      {result && <Card className="mt-6"><CardHeader><CardTitle>Estimated result</CardTitle><CardDescription>Simple daily accrual; {result.elapsedDays} elapsed days. This is not a posted or approved balance.</CardDescription></CardHeader><CardContent><p>Estimated interest: <strong>{BigInt(result.interestMinor).toLocaleString('en-US')}</strong> minor units</p><p>Remaining principal: <strong>{BigInt(result.principalMinor).toLocaleString('en-US')}</strong> minor units</p></CardContent></Card>}
      <p className="mt-4">Assumptions: actual elapsed days divided by the chosen 30-, 60- or 180-day period; simple interest; reductions at the start of the selected date; interest rounded once at the end. The 27th billing alignment, 60-day minimum, compounding, payment allocation and fees are not included.</p>
    </CardContent></Card>
  </main></div>
}
