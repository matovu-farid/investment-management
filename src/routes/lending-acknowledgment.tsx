import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { acknowledgmentFn } from '#/server/lending-acknowledgments/functions'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import './lending-acknowledgment.css'

export const Route = createFileRoute('/lending-acknowledgment')({
  validateSearch: (search: Record<string, unknown>): { kind: 'disbursement' | 'repayment'; id: string } => {
    if ((search.kind !== 'disbursement' && search.kind !== 'repayment') || typeof search.id !== 'string' || !search.id || search.id.length > 128) throw new Error('A valid record is required.')
    return { kind: search.kind, id: search.id }
  },
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => acknowledgmentFn({ data: deps }),
  errorComponent: () => <div className="app"><main className="dashboard"><h1>Record unavailable</h1><p>The record could not be found or your access could not be confirmed.</p><Link to="/loans">Back to loans</Link></main></div>,
  component: LendingAcknowledgment,
})

function LendingAcknowledgment() {
  const record = Route.useLoaderData()
  const title = record.kind === 'disbursement' ? 'Loan disbursement' : 'Loan repayment'
  return <div className="app acknowledgment">
    <header className="acknowledgment-controls"><Link to="/" className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Button asChild variant="outline"><Link to="/loans">Back to loans</Link></Button></header>
    <main className="dashboard acknowledgment-page flex flex-col gap-6">
      <div><p className="eyebrow">RATS NETWORK INVESTMENT GROUP</p><h1>{title} acknowledgment</h1><p>Recorded details captured {record.capturedAt} UTC</p></div>
      <Alert><AlertTitle>Recorded information</AlertTitle><AlertDescription>This acknowledges information entered in the system. It does not independently prove that funds moved or establish a loan balance, interest, or repayment allocation.</AlertDescription></Alert>
      {(record.voidedAt || record.loanVoidedAt) && <Alert variant="destructive"><AlertTitle>Void recorded</AlertTitle><AlertDescription>{record.voidedAt && <p>This {record.kind === 'repayment' ? 'repayment' : 'loan'} was voided {record.voidedAt} UTC. Reason: {record.voidReason || 'not recorded'}.</p>}{record.kind === 'repayment' && record.loanVoidedAt && <p>The associated loan was voided {record.loanVoidedAt} UTC. Reason: {record.loanVoidReason || 'not recorded'}.</p>}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Record {record.id}</CardDescription></CardHeader><CardContent><dl className="acknowledgment-facts"><div><dt>Member</dt><dd>{record.memberName} · {record.memberNumber}</dd></div><div><dt>{record.kind === 'disbursement' ? 'Disbursement date' : 'Payment date'}</dt><dd>{record.date}</dd></div><div><dt>Recorded amount (minor units)</dt><dd>{record.currency} {record.amountMinor.toLocaleString('en-US')}</dd></div><div><dt>Loan record</dt><dd>{record.loanId}</dd></div><div><dt>Reference</dt><dd>{record.reference || 'Not recorded'}</dd></div><div><dt>Source status</dt><dd>{record.voidedAt ? 'Voided' : 'Recorded'}</dd></div></dl></CardContent></Card>
      <Card><CardHeader><CardTitle>Recorded accounting entries</CardTitle><CardDescription>Entries and reversals are shown with their effective dates. Future-dated records may be included; their presence alone does not establish the accounting position today.</CardDescription></CardHeader><CardContent>{record.journals.length === 0 ? <p>No linked posted journal recorded.</p> : <Table><TableHeader><TableRow><TableHead>Journal</TableHead><TableHead>Effective date</TableHead><TableHead>Recorded reversal</TableHead></TableRow></TableHeader><TableBody>{record.journals.map(journal => <TableRow key={journal.journalId}><TableCell>{journal.isCorrection ? 'Replacement' : 'Original'} · {journal.journalId}</TableCell><TableCell>{journal.date}</TableCell><TableCell>{journal.reversalId ? `${journal.reversalId} · effective ${journal.reversalDate || 'date unavailable'}` : 'None recorded'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <Button className="acknowledgment-controls self-start" type="button" onClick={() => window.print()}>Print acknowledgment</Button>
    </main>
  </div>
}
