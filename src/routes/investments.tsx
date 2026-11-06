import { confirmAction } from '#/components/confirmation-host'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { getSession } from '#/lib/auth.functions'
import { createInvestmentFn, createValuationFn, createTransactionFn, listInvestmentsFn } from '#/server/investments/functions'
import {PendingRequestNotice,usePendingRequest} from '#/lib/pending-requests/use-pending'
import { compareValuations, type ComparableValuation } from '#/server/investments/comparison'

export const Route = createFileRoute('/investments')({
  beforeLoad: async () => { const session=await getSession(); if (!session) throw redirect({ to: '/login' }); return {userId:session.user.id} },
  loader: async () => {
    try { return { investments: await listInvestmentsFn(), available: true } }
    catch { return { investments: [], available: false } }
  },
  pendingComponent: () => <main className="dashboard" role="status">Loading investment register…</main>,
  component: InvestmentRegister,
})

type InvestmentRequest={idempotencyKey:string;name:string;assetClass:string;currency:string}
type ValuationRequest={idempotencyKey:string;investmentId:string;valuationDate:string;amountMinor:string;basis:string;source:string}
type TransactionRequest={idempotencyKey:string;investmentId:string;transactionDate:string;transactionType:string;amountMinor:string;reference:string;notes:string}
function ValueComparison({ valuations }: { valuations: ComparableValuation[] }) {
  const comparisonId = useId()
  const [costId, setCostId] = useState('')
  const [marketId, setMarketId] = useState('')
  const comparison = compareValuations(valuations.find(v => v.id === costId), valuations.find(v => v.id === marketId))
  const option = (v: ComparableValuation) => `${v.valuationDate} · ${v.currency} ${v.amountMinor.toLocaleString('en-US')} minor units · ${v.basis} · ${v.source || 'No source recorded'}`
  return <section aria-label="Compare reported values" style={{ marginTop: 24 }}><h4>Compare reported cost and market value</h4>
    <p>Select the two recorded observations yourself. The difference is market value minus cost; it is not a cash receipt, an approved accounting gain, or a calculation of cost from transactions. Confirm the dates, bases and sources before using it.</p>
    {valuations.length < 2 ? <p>Record at least two observations to compare.</p> : <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <Field><FieldLabel htmlFor={`${comparisonId}-cost`}>Reported cost observation</FieldLabel><NativeSelect id={`${comparisonId}-cost`} value={costId} onChange={e => setCostId(e.target.value)}><NativeSelectOption value="">Select a recorded value</NativeSelectOption>{valuations.map(v => <NativeSelectOption key={v.id} value={v.id}>{option(v)}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${comparisonId}-market`}>Reported market value observation</FieldLabel><NativeSelect id={`${comparisonId}-market`} value={marketId} onChange={e => setMarketId(e.target.value)}><NativeSelectOption value="">Select a recorded value</NativeSelectOption>{valuations.map(v => <NativeSelectOption key={v.id} value={v.id}>{option(v)}</NativeSelectOption>)}</NativeSelect></Field>
      {costId && marketId && !comparison && <p role="alert">Choose two different observations for the same investment and currency.</p>}
      {comparison && <div aria-live="polite" className="flex flex-col gap-3"><p>Cost: {option(comparison.cost)}</p><p>Market value: {option(comparison.market)}</p><div className="flex flex-col gap-2" role="group" aria-label="Comparison of recorded cost and market value"><label className="flex flex-col gap-1">Cost<progress className="h-3 w-full accent-primary" value={comparison.cost.amountMinor} max={Math.max(comparison.cost.amountMinor, comparison.market.amountMinor, 1)} aria-label={`Cost: ${comparison.cost.amountMinor.toLocaleString('en-US')} ${comparison.cost.currency} minor units`} /></label><label className="flex flex-col gap-1">Market value<progress className="h-3 w-full accent-primary" value={comparison.market.amountMinor} max={Math.max(comparison.cost.amountMinor, comparison.market.amountMinor, 1)} aria-label={`Market value: ${comparison.market.amountMinor.toLocaleString('en-US')} ${comparison.market.currency} minor units`} /></label></div><p><strong>Difference (market less cost): {comparison.differenceMinor.startsWith('-') ? '−' : comparison.differenceMinor === '0' ? '' : '+'}{BigInt(comparison.differenceMinor).toLocaleString('en-US').replace('-', '')} {comparison.cost.currency} minor units ({comparison.direction}).</strong></p></div>}
    </div>}
  </section>
}
function InvestmentRegister() {
  const { investments, available } = Route.useLoaderData()
  const router = useRouter(); const {userId}=Route.useRouteContext()
  const investmentPending=usePendingRequest<InvestmentRequest>(userId,'investment-create'), valuationPending=usePendingRequest<ValuationRequest>(userId,'investment-valuation'), transactionPending=usePendingRequest<TransactionRequest>(userId,'investment-transaction')
  const [name, setName] = useState(''); const [assetClass, setAssetClass] = useState(''); const [currency, setCurrency] = useState('UGX')
  const [investmentId, setInvestmentId] = useState(''); const [valuationDate, setValuationDate] = useState(''); const [amountMinor, setAmountMinor] = useState(''); const [basis, setBasis] = useState(''); const [source, setSource] = useState('')
  const [transactionInvestmentId, setTransactionInvestmentId] = useState(''); const [transactionDate, setTransactionDate] = useState(''); const [transactionType, setTransactionType] = useState(''); const [transactionAmount, setTransactionAmount] = useState(''); const [transactionReference, setTransactionReference] = useState(''); const [transactionNotes, setTransactionNotes] = useState('')
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  async function discardPending(discard:()=>void){if(await confirmAction('This request may already have been recorded. Check the register before discarding it. Discard the pending request?')){try{discard()}catch{setError('Could not discard the pending request in this tab.')}}}
 async function refreshAfterSave(confirmed:string){setMessage(confirmed);try{await router.invalidate()}catch{setMessage(`${confirmed} The list could not be refreshed; reload the page to see the saved record.`)}}
  async function sendInvestment(payload:InvestmentRequest,isNew:boolean){setBusy(true);setMessage('');setError('');try{await investmentPending.send(payload,v=>createInvestmentFn({data:{name:v.name,assetClass:v.assetClass,currency:v.currency,requestKey:v.idempotencyKey}}),isNew);setName('');setAssetClass('');await refreshAfterSave('Investment added.')}catch{setError('Investment was not confirmed. Check the register, then retry the pending request unchanged if the result is uncertain.')}finally{setBusy(false)}}
  async function saveInvestment(e:React.FormEvent<HTMLFormElement>){e.preventDefault();await sendInvestment({idempotencyKey:crypto.randomUUID(),name,assetClass,currency},true)}
  async function sendValuation(payload:ValuationRequest,isNew:boolean){setBusy(true);setMessage('');setError('');try{await valuationPending.send(payload,v=>createValuationFn({data:{investmentId:v.investmentId,valuationDate:v.valuationDate,amountMinor:v.amountMinor,basis:v.basis,source:v.source,requestKey:v.idempotencyKey}}),isNew);setValuationDate('');setAmountMinor('');setBasis('');setSource('');await refreshAfterSave('Valuation recorded.')}catch{setError('Valuation was not confirmed. Check the register, then retry the pending request unchanged if the result is uncertain.')}finally{setBusy(false)}}
  async function saveValuation(e:React.FormEvent<HTMLFormElement>){e.preventDefault();await sendValuation({idempotencyKey:crypto.randomUUID(),investmentId,valuationDate,amountMinor,basis,source},true)}
  async function sendTransaction(payload:TransactionRequest,isNew:boolean){setBusy(true);setMessage('');setError('');try{await transactionPending.send(payload,v=>createTransactionFn({data:{investmentId:v.investmentId,transactionDate:v.transactionDate,transactionType:v.transactionType,amountMinor:v.amountMinor,reference:v.reference,notes:v.notes,requestKey:v.idempotencyKey}}),isNew);setTransactionDate('');setTransactionType('');setTransactionAmount('');setTransactionReference('');setTransactionNotes('');await refreshAfterSave('Transaction recorded.')}catch{setError('Transaction was not confirmed. Check the register, then retry the pending request unchanged if the result is uncertain.')}finally{setBusy(false)}}
  async function saveTransaction(e:React.FormEvent<HTMLFormElement>){e.preventDefault();await sendTransaction({idempotencyKey:crypto.randomUUID(),investmentId:transactionInvestmentId,transactionDate,transactionType,amountMinor:transactionAmount,reference:transactionReference,notes:transactionNotes},true)}
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet" style={{ textDecoration: 'none' }}>Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Investment register</h1><p className="lead">Record investments and dated valuations with their basis and source.</p>
    <p><Link to="/investment-import">Import investment records →</Link></p>
    {!available ? <Alert role="alert"><AlertTitle>Investment register unavailable</AlertTitle><AlertDescription>You may not have permission to view this register, or it may be temporarily unavailable.</AlertDescription></Alert> : <>
      {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <Card className="mt-8"><CardHeader><CardTitle role="heading" aria-level={2}>Add an investment</CardTitle></CardHeader><CardContent>
        <PendingRequestNotice title="Investment" pending={investmentPending.pending} storageError={investmentPending.storageError} disabled={busy} onRetry={()=>{if(investmentPending.pending)void sendInvestment(investmentPending.pending,false)}} onDiscard={()=>discardPending(investmentPending.discard)}/>
        <form onSubmit={saveInvestment} className="max-w-2xl"><FieldGroup>
          <Field><FieldLabel htmlFor="investment-name">Name</FieldLabel><Input id="investment-name" value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></Field>
          <Field><FieldLabel htmlFor="investment-class">Asset class</FieldLabel><Input id="investment-class" value={assetClass} onChange={e => setAssetClass(e.target.value)} required maxLength={100} /></Field>
          <Field><FieldLabel htmlFor="investment-currency">Currency code</FieldLabel><Input id="investment-currency" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} required pattern="[A-Z]{3}" maxLength={3} /></Field>
          <Button disabled={busy || !investmentPending.ready || !!investmentPending.pending || !!investmentPending.storageError}>{busy ? 'Saving…' : 'Add investment'}</Button>
        </FieldGroup></form>
      </CardContent></Card>
      <Card className="mt-8"><CardHeader><CardTitle role="heading" aria-level={2}>Record a valuation</CardTitle><CardDescription>Enter an observed value, its date and basis. Use whole minor units of the investment currency.</CardDescription></CardHeader><CardContent>
        <PendingRequestNotice title="Valuation" pending={valuationPending.pending} storageError={valuationPending.storageError} disabled={busy} onRetry={()=>{if(valuationPending.pending)void sendValuation(valuationPending.pending,false)}} onDiscard={()=>discardPending(valuationPending.discard)}/>
        <form onSubmit={saveValuation} className="max-w-2xl"><FieldGroup>
          <Field><FieldLabel htmlFor="valuation-investment">Investment</FieldLabel><NativeSelect id="valuation-investment" value={investmentId} onChange={e => setInvestmentId(e.target.value)} required><NativeSelectOption value="">Select an investment</NativeSelectOption>{investments.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name} ({item.currency})</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="valuation-date">Valuation date</FieldLabel><DatePickerInput id="valuation-date" type="date" value={valuationDate} onChange={e => setValuationDate(e.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="valuation-amount">Amount in minor units</FieldLabel><Input id="valuation-amount" type="text" inputMode="numeric" pattern="[0-9]+" value={amountMinor} onChange={e => setAmountMinor(e.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="valuation-basis">Valuation basis</FieldLabel><Input id="valuation-basis" value={basis} onChange={e => setBasis(e.target.value)} required maxLength={200} placeholder="For example, market value" /></Field>
          <Field><FieldLabel htmlFor="valuation-source">Source (optional)</FieldLabel><Input id="valuation-source" value={source} onChange={e => setSource(e.target.value)} maxLength={200} /></Field>
          <Button disabled={busy || investments.length === 0 || !valuationPending.ready || !!valuationPending.pending || !!valuationPending.storageError}>{busy ? 'Saving…' : 'Record valuation'}</Button>
        </FieldGroup></form>
      </CardContent></Card>
      <Card className="mt-8"><CardHeader><CardTitle role="heading" aria-level={2}>Record investment income or transaction</CardTitle><CardDescription>Record an investment transaction from the source records. Recording it does not post to the accounts. Use the investment posting page to review and post it with approved accounts.</CardDescription></CardHeader><CardContent>
        <p><Link to="/investment-posting">Post recorded transactions to the ledger →</Link></p>
        <PendingRequestNotice title="Investment transaction" pending={transactionPending.pending} storageError={transactionPending.storageError} disabled={busy} onRetry={()=>{if(transactionPending.pending)void sendTransaction(transactionPending.pending,false)}} onDiscard={()=>discardPending(transactionPending.discard)}/>
        <form onSubmit={saveTransaction} className="max-w-2xl"><FieldGroup>
          <Field><FieldLabel htmlFor="transaction-investment">Investment</FieldLabel><NativeSelect id="transaction-investment" value={transactionInvestmentId} onChange={e => setTransactionInvestmentId(e.target.value)} required><NativeSelectOption value="">Select an investment</NativeSelectOption>{investments.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name} ({item.currency})</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="transaction-date">Transaction date</FieldLabel><DatePickerInput id="transaction-date" type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="transaction-type">Transaction type</FieldLabel><Input id="transaction-type" value={transactionType} onChange={e => setTransactionType(e.target.value)} required maxLength={100} placeholder="For example, dividend or purchase" /></Field>
          <Field><FieldLabel htmlFor="transaction-amount">Amount in minor units</FieldLabel><Input id="transaction-amount" type="text" inputMode="numeric" pattern="[0-9]+" value={transactionAmount} onChange={e => setTransactionAmount(e.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="transaction-reference">Reference (optional)</FieldLabel><Input id="transaction-reference" value={transactionReference} onChange={e => setTransactionReference(e.target.value)} maxLength={200} /></Field>
          <Field><FieldLabel htmlFor="transaction-notes">Notes (optional)</FieldLabel><Textarea id="transaction-notes" value={transactionNotes} onChange={e => setTransactionNotes(e.target.value)} maxLength={2000} /></Field>
          <Button disabled={busy || investments.length === 0 || !transactionPending.ready || !!transactionPending.pending || !!transactionPending.storageError}>{busy ? 'Saving…' : 'Record transaction'}</Button>
        </FieldGroup></form>
      </CardContent></Card>
      <section className="mt-11"><h2>Investments ({investments.length})</h2>{investments.length === 0 ? <p>No investments have been added yet.</p> : investments.map(item => <Card key={item.id} className="mt-8"><CardHeader><CardTitle role="heading" aria-level={3}>{item.name}</CardTitle><CardDescription>{item.assetClass} · {item.currency} · {item.status} · investment {item.id}{item.sourceRef ? ` · source reference ${item.sourceRef}` : ''}</CardDescription></CardHeader><CardContent>
        <h4>Transactions</h4>{item.transactions.length === 0 ? <p>No transactions recorded.</p> : <Table><TableHeader><TableRow>{['Date','Type','Amount (minor units)','Reference','Import source reference','Notes','Status'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{item.transactions.map(tx => <TableRow key={tx.id}><TableCell>{tx.transactionDate}</TableCell><TableCell>{tx.transactionType}</TableCell><TableCell>{item.currency} {tx.amountMinor.toLocaleString('en-US')}</TableCell><TableCell>{tx.reference || '—'}</TableCell><TableCell>{tx.sourceRef || '—'}</TableCell><TableCell>{tx.notes || '—'}</TableCell><TableCell>{tx.voidedAt ? `Voided ${tx.voidedAt} UTC: ${tx.voidReason}` : 'Recorded'}</TableCell></TableRow>)}</TableBody></Table>}
        <h4>Valuations</h4>{item.valuations.length === 0 ? <p>No valuations recorded.</p> : <Table><TableHeader><TableRow>{['Date','Value (minor units)','Basis','Source','Import source reference','Notes','Status'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{item.valuations.map(value => <TableRow key={value.id}><TableCell>{value.valuationDate}</TableCell><TableCell>{value.currency} {value.amountMinor.toLocaleString('en-US')}</TableCell><TableCell>{value.basis}</TableCell><TableCell>{value.source || '—'}</TableCell><TableCell>{value.sourceRef || '—'}</TableCell><TableCell>{value.notes || '—'}</TableCell><TableCell>{value.voidedAt ? `Voided ${value.voidedAt} UTC: ${value.voidReason}` : 'Recorded'}</TableCell></TableRow>)}</TableBody></Table>}
        <ValueComparison valuations={item.valuations.filter(value => !value.voidedAt)} />
      </CardContent></Card>)}</section>
    </>}
  </main></div>
}
