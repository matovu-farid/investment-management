import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { trialBalanceFn } from '#/server/trial-balance/functions'
import type { trialBalance } from '#/server/trial-balance/service'
import { trialBalanceCaveat, trialBalanceCsv } from '#/lib/trial-balance-export/export'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/trial-balance')({ beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, component: TrialBalance })
type Result = Awaited<ReturnType<typeof trialBalance>>
const amount = (value: string) => BigInt(value).toLocaleString('en-US')
function TrialBalance() {
  const [date, setDate] = useState(''), [result, setResult] = useState<Result | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); setResult(null); try { setResult(await trialBalanceFn({ data: date })) } catch { setError('Trial balance is unavailable. Check the date and your access, then try again.') } finally { setBusy(false) } }
  function download() { if (!result) return; const url = URL.createObjectURL(new Blob([trialBalanceCsv(result)], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `rnig-trial-balance-${result.asOf}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Trial balance</h1><p>Review posted journal activity by account and currency.</p>
    <Card className="mt-6"><CardHeader><CardTitle>Select an as-of date</CardTitle><CardDescription>Include posted entries through the selected date.</CardDescription></CardHeader><CardContent><form onSubmit={load}><FieldGroup><Field><FieldLabel htmlFor="trial-date">As-of date</FieldLabel><DatePickerInput id="trial-date" value={date} required onChange={e => setDate(e.target.value)} /></Field><Button type="submit" disabled={busy}>{busy ? 'Loading…' : 'View trial balance'}</Button></FieldGroup></form></CardContent></Card>
    {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <><Alert className="mt-6"><AlertDescription>{trialBalanceCaveat(result.asOf)}</AlertDescription></Alert>
      <Card className="mt-6"><CardHeader><CardTitle>Account balances</CardTitle><CardDescription>Amounts are whole minor units in the account currency.</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={download}>Download trial balance CSV</Button><p className="text-muted-foreground mt-3 text-sm">Import columns as text to preserve dates, account codes and large amounts. Protective apostrophes may appear.</p>{!result.accounts.length ? <p>No ledger accounts recorded.</p> : <Table><TableHeader><TableRow>{['Account','Name','Currency','Debits','Credits','Net debit','Net credit'].map(x => <TableHead key={x} scope="col">{x}</TableHead>)}</TableRow></TableHeader><TableBody>{result.accounts.map(a => <TableRow key={a.accountId}>{[a.code,a.name,a.currency,amount(a.debits),amount(a.credits),amount(a.netDebit),amount(a.netCredit)].map((v,i) => <TableCell key={i}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Totals by currency</CardTitle><CardDescription>Each currency is shown separately.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow>{['Currency','Debits','Credits','Net debit','Net credit'].map(x => <TableHead key={x} scope="col">{x}</TableHead>)}</TableRow></TableHeader><TableBody>{result.totals.map(t => <TableRow key={t.currency}>{[t.currency,amount(t.debits),amount(t.credits),amount(t.netDebit),amount(t.netCredit)].map((v,i) => <TableCell key={i}>{v}</TableCell>)}</TableRow>)}</TableBody></Table></CardContent></Card></>}
  </main></div>
}
