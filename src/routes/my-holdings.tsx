import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { memberHoldingObservationsFn } from '#/server/holding-observations/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import './member-views.css'

export const Route = createFileRoute('/my-holdings')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => memberHoldingObservationsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: MyHoldings,
})

function MyHoldings() {
  const holdings = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/my-portfolio" className="quiet">Back to my records</Link></header><main className="dashboard"><p className="eyebrow">MY RECORDS / SHARES</p><h1>Reported shareholdings</h1><p className="member-view-intro">These positions were published from dated source records. They are not necessarily current. Joint observations show the whole holding and are not apportioned to you.</p><nav className="member-view-links" aria-label="Share records"><a href="#published-positions">Published positions</a><Link to="/my-share-values">Indicative share values →</Link></nav>
    <Card id="published-positions" className="member-view-section"><CardHeader><CardTitle>Published positions</CardTitle><CardDescription>Check the observation date and source for each position.</CardDescription></CardHeader><CardContent>
      {holdings === null ? <div className="flex flex-col items-start gap-4"><Alert variant="destructive"><AlertDescription>Reported shareholdings are unavailable. An active linked member account is required; if you have access, reload and try again.</AlertDescription></Alert><Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload</Button></div> : holdings.length === 0 ? <p>No holding observations are currently published for you.</p> : <Table><TableHeader><TableRow><TableHead>Holding</TableHead><TableHead>Observed</TableHead><TableHead>Shares</TableHead><TableHead>Source</TableHead><TableHead>Published</TableHead></TableRow></TableHeader><TableBody>{holdings.map(h => <TableRow key={h.id}><TableCell><Badge variant="secondary">{h.kind === 'joint' ? 'Joint holding (whole position)' : 'Individual holding'}</Badge></TableCell><TableCell>{h.observedDate}</TableCell><TableCell>{BigInt(h.shares).toLocaleString('en-US')}</TableCell><TableCell>{h.source}</TableCell><TableCell>{h.publishedAt}</TableCell></TableRow>)}</TableBody></Table>}
    </CardContent></Card></main></div>
}
