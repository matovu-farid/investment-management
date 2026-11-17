import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { loanReconciliationFn } from '#/server/loan-reconciliation/functions'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export const Route = createFileRoute('/loan-reconciliation')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => loanReconciliationFn()); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: Reconciliation,
})
const fmt = (value: string) => BigInt(value).toLocaleString('en-US')
const statusLabel = (status: string) => status === 'all reversed' ? 'all postings have recorded reversals' : status === 'active' ? 'a posting has no recorded reversal' : status

function Reconciliation() {
  const data = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header>
    <main className="dashboard flex flex-col gap-6">
      <div><p className="eyebrow">ADMINISTRATION</p><h1>Loan accounting reconciliation</h1><p>Snapshot generated {data.snapshotAt} UTC from current records.</p></div>
      <Alert><AlertTitle>About this comparison</AlertTitle><AlertDescription>This compares source records with their linked posted journals and reversals. Status describes recorded reversal history, not the accounting position as of today: future-dated posted journals and reversals are included, as are backdated entries recorded later. It does not calculate loan balances, interest, repayment allocation, or establish that account mappings are correct. Checks are limited and do not replace a full ledger audit.</AlertDescription></Alert>
      <nav aria-label="Loan accounting tools" className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/loan-posting">Disbursement posting</Link></Button>
        <Button asChild variant="outline"><Link to="/repayment-posting">Repayment posting</Link></Button>
        <Button asChild variant="outline"><Link to="/journal-corrections">Journal corrections</Link></Button>
      </nav>
      {data.anomalies.length > 0 && <Alert variant="destructive"><AlertTitle>Unmatched journals requiring review</AlertTitle><AlertDescription><ul className="list-disc pl-5">{data.anomalies.map(a => <li key={a.journalId}>Journal {a.journalId}: {a.message}</li>)}</ul></AlertDescription></Alert>}
      <Card><CardHeader><CardTitle>Brought-forward interest</CardTitle><CardDescription>Opening interest is recorded separately from principal and subsequent interest accruals. Corrected openings retain their reversal history.</CardDescription></CardHeader><CardContent>{data.openingInterest.length===0?<p>No brought-forward interest journals recorded.</p>:<Table><TableHeader><TableRow><TableHead>Loan</TableHead><TableHead>Opening date</TableHead><TableHead>Interest (minor units)</TableHead><TableHead>Journal and correction</TableHead></TableRow></TableHeader><TableBody>{data.openingInterest.map(a=><TableRow key={a.eventId}><TableCell>{a.loanId}{a.issues.length>0&&<ul className="list-disc pl-5">{a.issues.map(i=><li key={i}>{i}</li>)}</ul>}</TableCell><TableCell>{a.eventDate}</TableCell><TableCell>{a.currency??'Currency unavailable'} {fmt(a.amountMinor)}</TableCell><TableCell>{a.journalId??'missing'}{a.reversalId?` · reversal ${a.reversalId} effective ${a.reversalDate}`:' · no recorded reversal'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Billing interest accruals</CardTitle><CardDescription>Interest journals are shown separately from loan principal and repayment amounts. Corrected events retain their journal and reversal history.</CardDescription></CardHeader><CardContent>{data.accruals.length===0?<p>No billing interest accruals recorded.</p>:<Table><TableHeader><TableRow><TableHead>Loan and event</TableHead><TableHead>Date</TableHead><TableHead>Interest (minor units)</TableHead><TableHead>Journal and correction</TableHead></TableRow></TableHeader><TableBody>{data.accruals.map(a=><TableRow key={a.eventId}><TableCell>{a.loanId} · {a.eventId}{a.issues.length>0&&<ul className="list-disc pl-5">{a.issues.map(i=><li key={i}>{i}</li>)}</ul>}</TableCell><TableCell>{a.eventDate}</TableCell><TableCell>{a.currency??'Currency unavailable'} {fmt(a.amountMinor)}</TableCell><TableCell>{a.journalId??'missing'}{a.reversalId?` · reversal ${a.reversalId} effective ${a.reversalDate}`:' · no recorded reversal'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      {data.sources.length === 0 ? <Card><CardContent><p>No recorded loans or repayments.</p></CardContent></Card> : data.sources.map(s => <Card key={`${s.kind}:${s.sourceId}`}>
        <CardHeader><CardTitle>{s.kind === 'loan' ? 'Loan source' : 'Repayment'} · {s.memberName ?? 'Member unavailable'} · {s.sourceDate}</CardTitle><CardDescription>Source {s.sourceId}{s.kind === 'repayment' ? ` · Loan ${s.loanId}` : ' · original loan amount and date'} · {s.currency ?? 'Currency unavailable'} {fmt(s.amountMinor)} minor units</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2"><span>Journal status:</span> <Badge variant="secondary">{statusLabel(s.status)}</Badge>{s.voidedAt && <Badge variant="destructive">Source voided {s.voidedAt} UTC · reason: {s.voidReason}</Badge>}</div>
          {s.issues.length > 0 && <Alert variant="destructive"><AlertTitle>Source issues</AlertTitle><AlertDescription><ul className="list-disc pl-5">{s.issues.map(i => <li key={i}>{i}</li>)}</ul></AlertDescription></Alert>}
          {s.zeroPrincipalHistory.map((opening,index)=><p key={`${opening.openingDate}-${index}`}>Reviewed zero principal opening at {opening.openingDate}: {opening.corrected?`corrected: ${opening.reason}`:'active'}. No principal journal was posted.</p>)}
          {s.versions.length === 0 ? <p>No posted source-linked journal recorded.</p> : <Table><TableHeader><TableRow><TableHead>Journal</TableHead><TableHead>Effective date</TableHead><TableHead>Debits / credits (minor units)</TableHead><TableHead>Reversal history</TableHead></TableRow></TableHeader><TableBody>{s.versions.map(v => <TableRow key={v.journalId}><TableCell>{v.type} · {v.journalId}{v.issues.length > 0 && <ul className="list-disc pl-5">{v.issues.map(i => <li key={i}>{i}</li>)}</ul>}</TableCell><TableCell>{v.journalDate}</TableCell><TableCell>{v.journalCurrency} debit {fmt(v.debitMinor)} / credit {fmt(v.creditMinor)}</TableCell><TableCell>{v.reversalId ? `reversal ${v.reversalId} effective ${v.reversalDate}` : 'no recorded reversal'}{v.predecessorReversalId ? ` · predecessor reversal ${v.predecessorReversalId}` : ''}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>)}
    </main>
  </div>
}
