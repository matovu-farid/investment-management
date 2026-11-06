import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { memberShareValuesFn } from '#/server/share-values/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/my-share-values')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  loader: async () => memberShareValuesFn().catch(() => null),
  component: MyShareValues,
})

const number = (s: string) => BigInt(s).toLocaleString('en-US')
function MyShareValues() {
  const values = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/my-holdings" className="quiet">Back to reported shareholdings</Link></header><main className="dashboard"><p className="eyebrow">MEMBER PORTAL</p><h1>Indicative share values</h1><p>These values use reported holdings and manually supplied prices on the dates shown. They are not necessarily current or approved and are not borrowing capacity. Joint holdings show the whole position and are not apportioned to you.</p>
    <Card><CardHeader><CardTitle>Published indicative values</CardTitle><CardDescription>Review the holding and price dates, basis and sources for each value.</CardDescription></CardHeader><CardContent>
      {values === null ? <div className="flex flex-col items-start gap-4"><Alert variant="destructive"><AlertDescription>Indicative values are unavailable. An active linked member account is required; if you have access, reload and try again.</AlertDescription></Alert><Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload</Button></div> : values.length === 0 ? <p>No indicative share values are currently published for you.</p> : <Table><TableHeader><TableRow><TableHead>Holding</TableHead><TableHead>Holding observed</TableHead><TableHead>Shares</TableHead><TableHead>Holding source</TableHead><TableHead>Price date</TableHead><TableHead>Price per share</TableHead><TableHead>Basis and price source</TableHead><TableHead>Indicative total</TableHead><TableHead>Published</TableHead></TableRow></TableHeader><TableBody>{values.map(v => <TableRow key={v.id}><TableCell><Badge variant="secondary">{v.kind === 'joint' ? 'Joint holding (whole position)' : 'Individual holding'}</Badge></TableCell><TableCell>{v.observedDate}</TableCell><TableCell>{number(v.shares)}</TableCell><TableCell>{v.holdingSource}</TableCell><TableCell>{v.priceDate}{v.priceDate !== v.observedDate && <p>The price date differs from the holding observation date.</p>}</TableCell><TableCell>{number(v.priceMinor)} {v.currency} minor units per share</TableCell><TableCell>{v.basis} · {v.priceSource}</TableCell><TableCell><strong>{number(v.valueMinor)} {v.currency} minor units</strong></TableCell><TableCell>{v.publishedAt}</TableCell></TableRow>)}</TableBody></Table>}
    </CardContent></Card></main></div>
}
