import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { memberBooksFn } from '#/server/book-publications/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/group-books')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  loader: async () => memberBooksFn().catch(() => null),
  component: GroupBooks,
})
const number = (value: string) => BigInt(value).toLocaleString('en-US')
function GroupBooks() {
  const publications = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">MEMBER PORTAL</p><h1>Group books</h1>
    <Alert><AlertDescription>These are published trial balance snapshots of posted accounts through the dates shown. A future as-of date includes future-dated posted entries. They are not necessarily current or approved financial statements. Amounts are integer minor units in the currency shown; individual journal entries are not included.</AlertDescription></Alert>
    {publications === null ? <Card className="mt-6"><CardHeader><CardTitle>Group books are unavailable</CardTitle><CardDescription>An active linked member account is required; if you have access, reload and try again.</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload</Button></CardContent></Card> : publications.length === 0 ? <Card className="mt-6"><CardHeader><CardTitle>No published group books</CardTitle><CardDescription>No group books are currently published.</CardDescription></CardHeader></Card> : publications.map(p => <Card key={p.id} className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>As of {p.asOf}</CardTitle><CardDescription>Snapshot generated {p.snapshotAt} UTC · published {p.publishedAt} UTC. Later backdated entries may change a newly generated report.</CardDescription></CardHeader><CardContent className="flex min-w-0 flex-col gap-5">
      <p className="m-0 text-sm text-muted-foreground sm:hidden">Swipe across each table to see all columns.</p>
      {p.accounts.length ? <Table><TableHeader><TableRow>{['Code', 'Account', 'Currency', 'Debits', 'Credits', 'Net debit', 'Net credit'].map(h => <TableHead scope="col" key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{p.accounts.map((a, i) => <TableRow key={`${a.currency}-${a.code}-${i}`}>{[a.code, a.name, a.currency, number(a.debits), number(a.credits), number(a.netDebit), number(a.netCredit)].map((v, j) => <TableCell key={j}>{v}</TableCell>)}</TableRow>)}</TableBody></Table> : <p>No accounts in this snapshot.</p>}
      <div><h3>Totals by currency</h3><Table><TableHeader><TableRow>{['Currency', 'Debits', 'Credits', 'Net debit', 'Net credit'].map(h => <TableHead scope="col" key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{p.totals.map(t => <TableRow key={t.currency}>{[t.currency, number(t.debits), number(t.credits), number(t.netDebit), number(t.netCredit)].map((v, i) => <TableCell key={i}>{v}</TableCell>)}</TableRow>)}</TableBody></Table></div>
    </CardContent></Card>)}
  </main></div>
}
