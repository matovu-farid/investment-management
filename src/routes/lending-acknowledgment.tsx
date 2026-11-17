import { dispatchRouteLabel, type DispatchRoute } from '#/lib/dispatch-guidance'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { parseAcknowledgmentSearch } from '#/lib/acknowledgment-search'
import { getSession } from '#/lib/auth.functions'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { acknowledgmentFn } from '#/server/lending-acknowledgments/functions'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import './lending-acknowledgment.css'

export const Route = createFileRoute('/lending-acknowledgment')({
  validateSearch: parseAcknowledgmentSearch,
  beforeLoad: async ({ search }) => {
    const { data } = await loadRouteInParallel(
      async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
      async () => search.kind ? acknowledgmentFn({ data: { kind: search.kind, id: search.id } }) : null,
    )
    return { initialData: data }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context }) => context.initialData,
  errorComponent: () => <div className="app"><main className="dashboard"><h1>Record unavailable</h1><p>The record could not be found or your access could not be confirmed.</p><Link to="/loans">Back to loans</Link></main></div>,
  component: LendingAcknowledgment,
})

function LendingAcknowledgment() {
  const record = Route.useLoaderData()
  if (!record) return <div className="app"><main className="dashboard"><h1>Record unavailable</h1><p>A valid acknowledgment link is required.</p><Link to="/loans">Back to loans</Link></main></div>
  const hasOpenings = record.kind === 'disbursement' && record.openings.length > 0
  const title = hasOpenings ? 'Brought-forward loan' : record.kind === 'disbursement' ? 'Loan disbursement' : 'Loan repayment'
  return <div className="app acknowledgment">
    <header className="acknowledgment-controls"><Link to="/" className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Button asChild variant="outline"><Link to="/loans">Back to loans</Link></Button></header>
    <main className="dashboard acknowledgment-page flex flex-col gap-6">
      <div><p className="eyebrow">RATS NETWORK INVESTMENT GROUP</p><h1>{title} acknowledgment</h1><p>Recorded details captured {record.capturedAt} UTC</p></div>
      <Alert><AlertTitle>Recorded information</AlertTitle><AlertDescription>This acknowledges information entered in the system. It does not independently prove that funds moved or establish a loan balance, interest, or repayment allocation.</AlertDescription></Alert>
      {(record.voidedAt || record.loanVoidedAt) && <Alert variant="destructive"><AlertTitle>Void recorded</AlertTitle><AlertDescription>{record.voidedAt && <p>This {record.kind === 'repayment' ? 'repayment' : 'loan'} was voided {record.voidedAt} UTC. Reason: {record.voidReason || 'not recorded'}.</p>}{record.kind === 'repayment' && record.loanVoidedAt && <p>The associated loan was voided {record.loanVoidedAt} UTC. Reason: {record.loanVoidReason || 'not recorded'}.</p>}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Record {record.id}</CardDescription></CardHeader><CardContent><dl className="acknowledgment-facts"><div><dt>Member</dt><dd>{record.memberName} · {record.memberNumber}</dd></div><div><dt>{hasOpenings ? 'Original disbursement date (historical)' : record.kind === 'disbursement' ? 'Disbursement date' : 'Payment date'}</dt><dd>{record.date}</dd></div><div><dt>{hasOpenings ? 'Original loan principal (minor units)' : 'Recorded amount (minor units)'}</dt><dd>{record.currency} {record.amountMinor.toLocaleString('en-US')}</dd></div><div><dt>Loan record</dt><dd>{record.loanId}</dd></div><div><dt>Reference</dt><dd>{record.reference || 'Not recorded'}</dd></div><div><dt>Source status</dt><dd>{record.voidedAt ? 'Voided' : 'Recorded'}</dd></div></dl></CardContent></Card>
      {hasOpenings && <Card><CardHeader><CardTitle>Opening balance history</CardTitle><CardDescription>These entries record brought-forward receivables at the cutoff. They do not represent a new bank disbursement.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Cutoff date</TableHead><TableHead>Opening principal (minor units)</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{record.openings.map(opening => <TableRow key={opening.journalId}><TableCell>{opening.openingDate}</TableCell><TableCell>{record.currency} {opening.principalMinor.toLocaleString('en-US')}</TableCell><TableCell>{opening.source}</TableCell><TableCell>{opening.correctionReason ? `Corrected: ${opening.correctionReason}` : 'Recorded'} · {opening.principalMinor===0 ? 'no principal journal' : `journal ${opening.journalId}`}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
      <Card><CardHeader><CardTitle>Recorded accounting entries</CardTitle><CardDescription>Entries and reversals are shown with their effective dates. Future-dated records may be included; their presence alone does not establish the accounting position today.</CardDescription></CardHeader><CardContent>{record.journals.length === 0 ? <p>No linked posted journal recorded.</p> : <Table><TableHeader><TableRow><TableHead>Journal</TableHead><TableHead>Effective date</TableHead><TableHead>Recorded reversal</TableHead></TableRow></TableHeader><TableBody>{record.journals.map(journal => <TableRow key={journal.journalId}><TableCell>{journal.journalId}{journal.dispatchRoute && <><br /><small>Declared route: {dispatchRouteLabel[journal.dispatchRoute as DispatchRoute] ?? journal.dispatchRoute} (not payment proof)</small></>}</TableCell><TableCell>{journal.date}</TableCell><TableCell>{journal.reversalId ? `${journal.reversalId} · effective ${journal.reversalDate || 'date unavailable'}` : 'None recorded'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Button className="acknowledgment-controls self-start" type="button" onClick={() => window.print()}>Print acknowledgment</Button>
    </main>
  </div>
}
