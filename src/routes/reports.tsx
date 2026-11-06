import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { getSession } from '#/lib/auth.functions'
import { reportForPeriodFn } from '#/server/reports/functions'
import type { Fact, Report } from '#/server/reports/service'
import { reportCsv, reportCaveats, reportSections } from '#/lib/report-export/export'

export const Route = createFileRoute('/reports')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  component: Reports,
})

function FactTable({ title, rows, columns }: { title: string; rows: Fact[]; columns: [string, string][] }) {
  return <Card className="mt-6">
    <CardHeader><CardTitle className="flex flex-wrap items-center gap-2">{title} <Badge variant="secondary">{rows.length}</Badge></CardTitle></CardHeader>
    <CardContent>{rows.length === 0 ? <p className="text-sm text-muted-foreground">No records for this selection.</p> :
      <Table><TableHeader><TableRow>{columns.map(([key, label]) => <TableHead key={key} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map(([key]) => <TableCell key={key}>{row[key] == null ? '—' : String(row[key])}</TableCell>)}</TableRow>)}</TableBody>
      </Table>}
    </CardContent>
  </Card>
}

function Reports() {
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [report, setReport] = useState<Report | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function load(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setReport(null)
    try { setReport(await reportForPeriodFn({ data: { start, end } })) }
    catch { setError('The report is unavailable. Check the dates and your access, then try again.') }
    finally { setBusy(false) }
  }
  function download() {
    if (!report) return
    const url = URL.createObjectURL(new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `rnig-recorded-activity-${report.start}-to-${report.end}.csv`
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const caveats = report ? reportCaveats(report) : []
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet" style={{ textDecoration: 'none' }}>Back to overview</Link></header>
    <main className="dashboard"><p className="eyebrow">ADMINISTRATION</p><h1>Recorded activity</h1><p className="lead">Review dated records within a selected period.</p>
      <Card className="mt-8"><CardHeader><CardTitle>Select a reporting period</CardTitle><CardDescription>Choose the start and end dates for the activity report.</CardDescription></CardHeader><CardContent>
        <form onSubmit={load}><FieldGroup className="sm:flex-row sm:items-end"><Field><FieldLabel htmlFor="report-start">Start date</FieldLabel><DatePickerInput id="report-start" required value={start} onChange={e => setStart(e.target.value)} /></Field><Field><FieldLabel htmlFor="report-end">End date</FieldLabel><DatePickerInput id="report-end" required min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} /></Field><Button disabled={busy}>{busy ? 'Loading…' : 'View report'}</Button></FieldGroup></form>
      </CardContent></Card>
      {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {report && <>{caveats.map((caveat, index) => <Alert className="mt-6" key={index}><AlertDescription>{caveat}</AlertDescription></Alert>)}
        <Card className="mt-6"><CardHeader><CardTitle>Export report</CardTitle><CardDescription>CSV includes all report sections. Spreadsheet programs may change dates, leading zeroes or large numbers; import columns as text to preserve them. Protective apostrophes may appear.</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={download}>Download CSV for board pack</Button></CardContent></Card>
        {reportSections.map(section => <FactTable key={section.key} title={section.title} rows={report[section.key] ?? []} columns={section.columns} />)}
      </>}
    </main></div>
}
