import { SpinnerLabel } from '#/components/ui/spinner'
import { CreditRequestTimingSummary } from '#/components/credit-request-timing-summary'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { quadrimesterDates } from '#/lib/quadrimester'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { getSession } from '#/lib/auth.functions'
import { reportForPeriodFn } from '#/server/reports/functions'
import type { Fact, Report } from '#/server/reports/service'
import { reportCsv, reportCaveats, reportSections } from '#/lib/report-export/export'
import './report-workspace.css'

export const Route = createFileRoute('/reports')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  component: Reports,
})

function FactTable({ id, title, rows, columns, summary }: { id: string; title: string; rows: Fact[]; columns: [string, string][]; summary:boolean }) {
  return <Card id={id} className="mt-6 report-section">
    <CardHeader><CardTitle className="flex flex-wrap items-center gap-2"><h2>{title}</h2> {!summary&&<Badge variant="secondary">{rows.length}</Badge>}</CardTitle></CardHeader>
    <CardContent>{rows.length === 0 ? <p className="text-sm text-muted-foreground">No records for this selection.</p> : summary ? <CreditRequestTimingSummary rows={rows}/> : <> {columns.length>6&&<p className="mb-3 text-sm text-muted-foreground">Scroll horizontally to view all columns.</p>}<Table><TableHeader><TableRow>{columns.map(([key, label]) => <TableHead key={key} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map(([key]) => <TableCell key={key}>{row[key] == null ? '—' : String(row[key])}</TableCell>)}</TableRow>)}</TableBody>
      </Table></>}
    </CardContent>
  </Card>
}

function Reports() {
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [report, setReport] = useState<Report | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [periodYear, setPeriodYear] = useState(''); const [period, setPeriod] = useState('1')
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
    <main className="dashboard report-workspace"><p className="eyebrow">REPORTS &amp; BOARD / RECORDED ACTIVITY</p><h1>Recorded activity</h1><p className="lead">Review dated records within a selected period.</p><p><Link to="/board-packets">Create or review board-pack drafts →</Link></p>
      <Card className="mt-8"><CardHeader><CardTitle>Select a reporting period</CardTitle><CardDescription>Choose the start and end dates for the activity report.</CardDescription></CardHeader><CardContent>
        <FieldSet disabled={busy} className="mb-4 gap-0 border-0 p-0">
          <FieldLegend variant="label" className="mb-3 border-b pb-2 font-semibold">Calendar quadrimester shortcut</FieldLegend>
          <FieldGroup className="flex flex-row flex-wrap items-end gap-3">
            <Field className="min-w-[12rem] flex-1"><FieldLabel htmlFor="report-year">Year</FieldLabel><Input id="report-year" inputMode="numeric" maxLength={4} placeholder="2026" value={periodYear} onChange={e=>setPeriodYear(e.target.value)} /></Field>
            <Field className="min-w-[12rem] flex-1"><FieldLabel htmlFor="report-period">Period</FieldLabel><NativeSelect id="report-period" value={period} onChange={e=>setPeriod(e.target.value)}><NativeSelectOption value="1">1 · January–April</NativeSelectOption><NativeSelectOption value="2">2 · May–August</NativeSelectOption><NativeSelectOption value="3">3 · September–December</NativeSelectOption></NativeSelect></Field>
            <Button type="button" variant="outline" disabled={!quadrimesterDates(periodYear,period)} onClick={()=>{const dates=quadrimesterDates(periodYear,period);if(!dates)return;setStart(dates.start);setEnd(dates.end);setReport(null);setError('')}}>Use period</Button>
          </FieldGroup>
        </FieldSet>
        <form onSubmit={load}><FieldGroup className="sm:flex-row sm:items-end"><Field><FieldLabel htmlFor="report-start">Start date</FieldLabel><DatePickerInput id="report-start" required disabled={busy} value={start} onChange={e => {setStart(e.target.value);setReport(null);setError('')}} /></Field><Field><FieldLabel htmlFor="report-end">End date</FieldLabel><DatePickerInput id="report-end" required disabled={busy} min={start || undefined} value={end} onChange={e => {setEnd(e.target.value);setReport(null);setError('')}} /></Field><Button disabled={busy}>{busy ? <SpinnerLabel>View report</SpinnerLabel> : 'View report'}</Button></FieldGroup></form>
      </CardContent></Card>
      {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {report && <>{caveats.map((caveat, index) => <Alert className="mt-6" key={index}><AlertDescription>{caveat}</AlertDescription></Alert>)}
        <Card className="mt-6"><CardHeader><CardTitle><h2>Report sections</h2></CardTitle><CardDescription>Recorded activity from {report.start} to {report.end}. Open a section to review its details.</CardDescription></CardHeader><CardContent><nav className="report-section-links" aria-label="Report sections">{reportSections.map(section => <a key={section.key} href={`#report-${section.key}`}><span>{section.title}</span><span>{(report[section.key] ?? []).length.toLocaleString('en-US')} rows</span></a>)}</nav></CardContent></Card>
        <Card className="mt-6"><CardHeader><CardTitle>Export report</CardTitle><CardDescription>CSV includes all report sections. Spreadsheet programs may change dates, leading zeroes or large numbers; import columns as text to preserve them. Protective apostrophes may appear.</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={download}>Download CSV for board pack</Button></CardContent></Card>
        {reportSections.map(section => <FactTable key={section.key} id={`report-${section.key}`} title={section.title} rows={report[section.key] ?? []} columns={section.columns} summary={section.key==='bookingAgeSummary'} />)}
      </>}
    </main></div>
}
