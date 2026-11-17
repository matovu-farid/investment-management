import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { listMemberTradePublicationsFn } from '#/server/trade-publications/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/group-trades')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => listMemberTradePublicationsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: GroupTrades,
})
const number = (value: string) => BigInt(value).toLocaleString('en-US')
function GroupTrades() {
  const trades = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/market" className="quiet">Back to share notices</Link></header><main className="dashboard">
    <p className="eyebrow">MEMBER PORTAL</p><h1>Share trade history</h1>
    <Alert><AlertDescription>These trade facts were selected for publication by an administrator. Names are omitted. The records do not establish that payment or transfer was settled, and they may not include every trade. Amounts are in the currency’s minor units.</AlertDescription></Alert>
    {trades === null ? <Card className="mt-6"><CardHeader><CardTitle>Trade history is unavailable</CardTitle><CardDescription>An active linked member account is required; if you have access, reload and try again.</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload</Button></CardContent></Card> : trades.length === 0 ? <Card className="mt-6"><CardHeader><CardTitle>No published trades</CardTitle><CardDescription>No share trades are currently published.</CardDescription></CardHeader></Card> : <Card className="mt-6"><CardHeader><CardTitle>Published trades</CardTitle><CardDescription>Transaction amounts and prices are in each trade’s currency and minor units.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow>{['Trade date','Shares','Currency','Price per share (minor units)','Transaction amount (minor units)','Published (UTC)'].map(h=><TableHead key={h} scope="col">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{trades.map(t=><TableRow key={t.id}><TableCell>{t.tradeDate}</TableCell><TableCell>{number(t.shares)}</TableCell><TableCell>{t.currency}</TableCell><TableCell>{number(t.priceMinor)}</TableCell><TableCell>{number(t.considerationMinor)}</TableCell><TableCell>{t.publishedAt}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
  </main></div>
}
