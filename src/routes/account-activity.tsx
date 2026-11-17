import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { formatJournalDescription } from '#/lib/journal-description'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { accountActivityFn, accountActivityOptionsFn } from '#/server/account-activity/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import './ledger-workspace.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/account-activity')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => { try { return { accounts: await accountActivityOptionsFn(), available: true } } catch { return { accounts: [], available: false } } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: AccountActivity,
})

type Result = Awaited<ReturnType<typeof accountActivityFn>>
const amount = (value: string) => BigInt(value).toLocaleString('en-US')

function AccountActivity() {
  const { accounts, available } = Route.useLoaderData()
  const [accountId, setAccountId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const term = search.trim().toLocaleLowerCase()
  const visibleLines = result?.lines.filter(line => !term || [line.effectiveDate, line.description, line.sourceType, line.sourceId ?? '', line.entryId].some(value => value.toLocaleLowerCase().includes(term))) ?? []

  async function load(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setResult(null); setBusy(true)
    try { setResult(await accountActivityFn({ data: { accountId, startDate, endDate } })) }
    catch { setError('Account activity is unavailable. Check your account, dates and access, then try again.') }
    finally { setBusy(false) }
  }
  function download() {
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `rnig-account-activity-${result.startDate}-${result.endDate}.csv`
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ACCOUNTING / ACCOUNT ACTIVITY</p><h1>Account activity</h1>
    <p>Review posted journal lines for one account and an inclusive date range. Select accounts according to the organisation’s approved mappings; this report does not classify income or cash.</p>
    {!available ? <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>Accounts are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <>
      {!accounts.length && <Alert className="mt-6"><AlertDescription>No ledger accounts are available. Add an account in the accounting ledger first.</AlertDescription></Alert>}
      <Card className="mt-6"><CardHeader><CardTitle>Select account and dates</CardTitle><CardDescription>Choose an account and an inclusive reporting period.</CardDescription></CardHeader><CardContent><form onSubmit={load}><FieldGroup>
        <Field><FieldLabel htmlFor="activity-account">Account</FieldLabel><NativeSelect id="activity-account" required value={accountId} disabled={busy} onChange={e => { setAccountId(e.target.value); setResult(null); setError('') }}><NativeSelectOption value="">Select an account</NativeSelectOption>{accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.code} — {a.name} ({a.currency})</NativeSelectOption>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="activity-from">From</FieldLabel><DatePickerInput id="activity-from" type="date" required value={startDate} max={endDate || undefined} disabled={busy} onChange={e => { setStartDate(e.target.value); setResult(null); setError('') }} /></Field>
        <Field><FieldLabel htmlFor="activity-to">To</FieldLabel><DatePickerInput id="activity-to" type="date" required value={endDate} min={startDate || undefined} disabled={busy} onChange={e => { setEndDate(e.target.value); setResult(null); setError('') }} /></Field>
        <Button type="submit" disabled={busy || !accounts.length}>{busy ? <SpinnerLabel>View account activity</SpinnerLabel> : 'View account activity'}</Button>
      </FieldGroup></form></CardContent></Card>
      {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {result && <section aria-labelledby="statement-heading"><nav className="ledger-workspace-nav" aria-label="Account activity sections"><a href="#activity-summary">Opening and closing</a><a href="#activity-lines">Posted lines</a></nav>
        <Alert className="mt-6"><AlertDescription>{result.startDate} to {result.endDate}, inclusive · {result.account.currency} · all amounts in integer minor units. Opening includes posted entries before the start date; closing includes entries through the end date. Snapshot taken {result.snapshotAt} UTC: this reflects records available then, not necessarily those known at the period end. Reversal entries appear on their effective dates; reversal references include only entries through the selected end date.</AlertDescription></Alert>
        <Card id="activity-summary" className="mt-6"><CardHeader><CardTitle id="statement-heading">{result.account.code} — {result.account.name}</CardTitle><CardDescription>Opening, period movement and closing activity.</CardDescription></CardHeader><CardContent>
        <Button type="button" variant="outline" onClick={download}>Download account activity CSV</Button>
        <p className="text-muted-foreground mt-3 text-sm">Import CSV columns as text to preserve account codes and large amounts. Protective apostrophes may appear.</p>
        <Table><TableHeader><TableRow>{['Position', 'Debits', 'Credits', 'Net debit', 'Net credit'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{([['Opening', result.opening], ['Period movement', result.period], ['Closing', result.closing]] as const).map(([label, position]) => <TableRow key={label}><TableHead scope="row">{label}</TableHead>{[position.debits, position.credits, position.netDebit, position.netCredit].map((value, i) => <TableCell key={i}>{amount(value)}</TableCell>)}</TableRow>)}</TableBody></Table>
        </CardContent></Card>
        <Card id="activity-lines" className="mt-6"><CardHeader><CardTitle>Posted lines</CardTitle><CardDescription>Source and reversal references are shown for each journal line.</CardDescription></CardHeader><CardContent><label className="ledger-filter" htmlFor="activity-line-search">Search posted lines<Input id="activity-line-search" type="search" placeholder="Description, source, journal or date" value={search} onChange={e => setSearch(e.target.value)} /></label><p className="ledger-filter-note" role="status">Showing {visibleLines.length} of {result.lines.length} lines. Summary and CSV include all lines.</p>{!result.lines.length ? <p>No posted lines in this period.</p> : !visibleLines.length ? <p>No posted lines match this search.</p> : <Table><TableHeader><TableRow>{['Date', 'Journal and description', 'Source', 'Reversal', 'Debit', 'Credit'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{visibleLines.map(line => <TableRow key={line.id}><TableCell>{line.effectiveDate}</TableCell><TableCell>{formatJournalDescription(line.sourceType, line.description)}<br /><small>Journal {line.entryId}</small></TableCell><TableCell>{line.sourceType}{line.sourceId ? ` · ${line.sourceId}` : ''}</TableCell><TableCell>{line.reversesEntryId ? `Reverses ${line.reversesEntryId}` : ''}{line.reversesEntryId && line.reversedById ? '; ' : ''}{line.reversedById ? `Reversed by ${line.reversedById}` : ''}</TableCell><TableCell>{line.side === 'debit' ? amount(line.amountMinor) : '—'}</TableCell><TableCell>{line.side === 'credit' ? amount(line.amountMinor) : '—'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      </section>}
    </>}
  </main></div>
}
