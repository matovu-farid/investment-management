import { SpinnerLabel } from '#/components/ui/spinner'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { lendingSnapshotFn } from '#/server/lending-snapshot/functions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'

export const Route = createFileRoute('/lending-snapshot')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  component: LendingSnapshot,
})

type Result = Awaited<ReturnType<typeof lendingSnapshotFn>>
const amount = (value: string) => BigInt(value).toLocaleString('en-US')
const visibility = {
  visible: 'Visible to the reviewed linked account',
  withdrawn: 'Withdrawn',
  member_inactive: 'Member currently inactive',
  link_inactive: 'Reviewed account link no longer active',
} as const

function LendingSnapshot() {
  const [asOf, setAsOf] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load(e: React.FormEvent) {
    e.preventDefault()
    setResult(null); setError(''); setBusy(true)
    try { setResult(await lendingSnapshotFn({ data: { asOf } })) }
    catch { setError('The lending snapshot is unavailable. Check the date and your access, then try again.') }
    finally { setBusy(false) }
  }
  function download() {
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `rnig-lending-snapshot-${result.asOf}.csv`
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/reports" className="quiet">Back to reports</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Lending snapshot</h1>
    <p>Review loans disbursed through a selected date, their reported balances and separately reported fund availability. This snapshot uses source observations; it does not calculate interest, allocate repayments or determine fund availability. For provisional calculations, see <Link to="/loan-billing">loan billing and repayment</Link>.</p>
    <Card className="mt-6"><CardHeader><CardTitle>Select an as-of date</CardTitle><CardDescription>Review source reports and loans dated through the selected date.</CardDescription></CardHeader><CardContent><form onSubmit={load} className="max-w-md"><FieldGroup><Field><FieldLabel htmlFor="snapshot-date">As-of date</FieldLabel><DatePickerInput id="snapshot-date" type="date" required value={asOf} disabled={busy} onChange={e => { setAsOf(e.target.value); setResult(null); setError('') }} /></Field><Button disabled={busy || !asOf}>{busy ? <SpinnerLabel>View lending snapshot</SpinnerLabel> : 'View lending snapshot'}</Button></FieldGroup></form></CardContent></Card>
    {error && <Alert variant="destructive" role="alert" className="mt-6"><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <section aria-labelledby="lending-snapshot-heading">
      <h2 id="lending-snapshot-heading">Loans through {result.asOf}</h2>
      <p>Snapshot taken {result.snapshotAt} UTC. The as-of date filters loan disbursement and reported balance and fund observation dates; it does not filter when records were entered or published. Backdated loans and reports recorded after the as-of date can therefore appear. Loan and fund void status and account-link status reflect the current register at the snapshot time, not necessarily what was known on the as-of date. A future as-of date may include future-dated loans or reports. Withdrawn reports remain in this administrative history. Amounts are integer minor units in their stated currency. Reports may have different dates or conflict; no balance is selected or added automatically.</p>
      <Button type="button" variant="outline" onClick={download}>Download lending snapshot CSV</Button>
      <p>Import CSV columns as text to preserve dates, identifiers and large amounts. Protective apostrophes may appear.</p>
      <Card className="mt-6" aria-labelledby="fund-observations-heading"><CardHeader><CardTitle role="heading" aria-level={3} id="fund-observations-heading">Reported fund availability</CardTitle><CardDescription>These amounts are reported from the sources shown, not calculated fund availability. No observation is selected or totalled automatically. Voided observations remain in this administrative history.</CardDescription></CardHeader><CardContent>{!result.fundObservations.length ? <p>No reported fund availability observations through this date.</p> : <ul>{result.fundObservations.map(o => <li key={o.id} className="mb-4 break-words"><strong>{o.currency} {amount(o.amountMinor)} minor units</strong> as reported for {o.observedDate} · basis: {o.basis} · source: {o.source}<br />Recorded {o.createdAt} UTC{o.voidedAt ? ` · voided ${o.voidedAt} UTC · reason: ${o.voidReason}` : ' · not voided'} · observation {o.id}</li>)}</ul>}</CardContent></Card>
      {!result.loans.length ? <p>No non-void loans are recorded through this date.</p> : result.loans.map(loan => <Card key={loan.id} className="mt-6"><CardHeader><CardTitle role="heading" aria-level={3}>{loan.memberName} · {loan.memberNumber}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
        <p>Loan {loan.id} · {loan.currency} {amount(loan.principalMinor)} minor units principal · disbursed {loan.disbursementDate} · maturity {loan.maturityDate || 'not recorded'}</p>
        <p>Recorded terms: {loan.terms}</p>
        <h4>Administrator-recorded balance observations</h4>
        <p>Recorded independently of member account access; they are not automatically published to a member.</p>
        {!(loan.observations ?? []).length ? <p>No administrator-recorded balance observations through this date.</p> : <ul>{(loan.observations ?? []).map(o => <li key={o.id} className="mb-4 break-words"><strong>{o.currency} {amount(o.amountMinor)} minor units</strong> as reported for {o.observedDate} · basis: {o.basis} · source: {o.source}<br />Recorded {o.createdAt} UTC by {o.createdBy}{o.voidedAt ? ` · voided ${o.voidedAt} UTC by ${o.voidedBy} · reason: ${o.voidReason}` : ' · not voided'} · observation {o.id}<br />{o.importSourceRef === undefined ? 'Import provenance not captured' : o.importSourceRef === null ? 'Manually recorded' : `Import source reference: ${o.importSourceRef} · batch: ${o.importBatchId ?? 'not captured'}`}</li>)}</ul>}
        <h4>Balance reports published to a member account</h4>
        {!loan.reports.length ? <p>No published balance reports through this date.</p> : <ul>{loan.reports.map(report => <li key={report.id} className="mb-4 break-words">
          <strong>{loan.currency} {amount(report.amountMinor)} minor units</strong> as reported for {report.observedDate} · basis: {report.basis} · source: {report.source}<br />
          Published {report.publishedAt} UTC{report.withdrawnAt ? ` · withdrawn ${report.withdrawnAt} UTC` : ''} · {visibility[report.visibility]}<br />
          Reviewed recipient: {report.recipientName} ({report.recipientEmail}) · publication {report.id}
        </li>)}</ul>}
      </CardContent></Card>)}
    </section>}
  </main></div>
}
