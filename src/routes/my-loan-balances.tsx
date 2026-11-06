import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { memberLoanBalancesFn } from '#/server/loan-balances/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/my-loan-balances')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  loader: async () => memberLoanBalancesFn().catch(() => null),
  component: MyLoanBalances,
})
const number = (value: string) => BigInt(value).toLocaleString('en-US')
function MyLoanBalances() {
  const values = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/my-portfolio" className="quiet">Back to my records</Link></header><main className="dashboard"><p className="eyebrow">MEMBER PORTAL</p><h1>Reported loan balances</h1><Alert><AlertDescription>These are balances supplied from the sources and dates shown. They are not calculated by this app, may not be current or approved, and do not establish settlement. Contact the administrator for a current statement or questions.</AlertDescription></Alert><Card className="mt-6"><CardHeader><CardTitle>Published balances</CardTitle><CardDescription>Check the reported date, basis and source for each balance.</CardDescription></CardHeader><CardContent>
    {values === null ? <div className="flex flex-col items-start gap-4"><Alert variant="destructive"><AlertDescription>Reported balances are unavailable. An active linked member account is required; if you have access, reload and try again.</AlertDescription></Alert><Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload</Button></div> : values.length === 0 ? <p>No loan balances are currently published for you.</p> : <Table><TableHeader><TableRow><TableHead>Loan</TableHead><TableHead>Reported as of</TableHead><TableHead>Balance (minor units)</TableHead><TableHead>Basis</TableHead><TableHead>Source</TableHead><TableHead>Published (UTC)</TableHead></TableRow></TableHeader><TableBody>{values.map(v => <TableRow key={v.id}><TableCell>{v.loanId}</TableCell><TableCell>{v.observedDate}</TableCell><TableCell>{v.currency} {number(v.amountMinor)}</TableCell><TableCell>{v.basis}</TableCell><TableCell>{v.source}</TableCell><TableCell>{v.publishedAt}</TableCell></TableRow>)}</TableBody></Table>}
  </CardContent></Card></main></div>
}
