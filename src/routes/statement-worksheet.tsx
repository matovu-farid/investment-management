import { SpinnerLabel } from '#/components/ui/spinner'
import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { Button } from '#/components/ui/button'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Input } from '#/components/ui/input'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { DatePickerInput } from '#/components/ui/date-picker'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { statementWorksheetFn, statementWorksheetOptionsFn } from '#/server/statement-worksheet/functions'

export const Route = createFileRoute('/statement-worksheet')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => { try { return { accounts: await statementWorksheetOptionsFn(), available: true } } catch { return { accounts: [], available: false } } }); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: StatementWorksheet,
})

type Polarity = '' | 'debit-minus-credit' | 'credit-minus-debit'
type MappingInput = { lineName: string; polarity: Polarity }
type Result = Awaited<ReturnType<typeof statementWorksheetFn>>
const amount = (value: string) => BigInt(value).toLocaleString('en-US')
const cell = { padding: '0.75rem', textAlign: 'left' as const, verticalAlign: 'top' as const, borderBottom: '1px solid var(--border)' }
const visuallyHidden = { position: 'absolute' as const, width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden' as const, clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap' as const, border: 0 }

function StatementWorksheet() {
  const { accounts, available } = Route.useLoaderData()
  const [mode, setMode] = useState<'position' | 'activity'>('position')
  const [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState('')
  const [mapping, setMapping] = useState<Record<string, MappingInput>>({})
  const [result, setResult] = useState<Result | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')

  function edit(id: string, patch: Partial<MappingInput>) {
    setMapping(previous => ({ ...previous, [id]: { ...(previous[id] ?? { lineName: '', polarity: '' }), ...patch } }))
    setResult(null); setError('')
  }
  async function generate(e: React.FormEvent) {
    e.preventDefault(); setError(''); setResult(null)
    const selected = accounts.filter(a => (mapping[a.id]?.polarity ?? '') !== '')
    if (selected.some(a => !mapping[a.id]?.lineName.trim())) { setError('Enter a line name for each mapped account.'); return }
    const mappings = selected.map(a => ({ accountId: a.id, lineName: mapping[a.id].lineName.trim(), polarity: mapping[a.id].polarity as Exclude<Polarity, ''> }))
    setBusy(true)
    try { setResult(await statementWorksheetFn({ data: { mode, startDate: mode === 'activity' ? startDate : null, endDate, mappings } })) }
    catch { setError('The working paper could not be generated. Check the dates, mappings and your access, then try again.') }
    finally { setBusy(false) }
  }
  function download() {
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `rnig-statement-working-paper-${result.endDate}.csv`
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Financial statement working paper</h1>
    <p>Choose which ledger accounts belong to each line and how their debits and credits are presented. This is a user-mapped working paper, not an approved financial statement. No account classification, accounting policy or currency conversion is inferred.</p>
    {!available ? <Alert variant="destructive" role="alert"><AlertDescription>Accounts are unavailable or access could not be confirmed. Reload and try again.</AlertDescription></Alert> : <form onSubmit={generate}>
      <section className="record-panel"><h2>Period and mappings</h2><p>Position includes posted entries through the as-of date. Period activity includes posted entries on and between the selected dates. Reversals appear by their effective dates.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end' }}>
          <label>Working paper <NativeSelect value={mode} disabled={busy} onChange={e => { setMode(e.target.value as 'position' | 'activity'); setResult(null); setError('') }}><NativeSelectOption value="position">Position as of a date</NativeSelectOption><NativeSelectOption value="activity">Activity for a period</NativeSelectOption></NativeSelect></label>
          {mode === 'activity' && <label>From <DatePickerInput required value={startDate} max={endDate || undefined} disabled={busy} onChange={e => { setStartDate(e.target.value); setResult(null); setError('') }} /></label>}
          <label>{mode === 'position' ? 'As-of date' : 'To'} <DatePickerInput required value={endDate} min={mode === 'activity' ? startDate || undefined : undefined} disabled={busy} onChange={e => { setEndDate(e.target.value); setResult(null); setError('') }} /></label>
        </div>
        <h3>Account mappings</h3><p>Leave an account unmapped to exclude it from the lines. Its posted debit and credit totals will remain visible in the review. Accounts with the same line name and currency are combined.</p>
        {!accounts.length ? <p>No ledger accounts are available. Add accounts in the accounting register first.</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr>{['Account', 'Line name', 'Presentation'].map(h => <th key={h} scope="col" style={cell}>{h}</th>)}</tr></thead><tbody>{accounts.map(a => { const value = mapping[a.id] ?? { lineName: '', polarity: '' }; return <tr key={a.id}><th scope="row" style={cell}>{a.code} · {a.name}<br /><small>{a.currency}</small></th><td style={cell}><label><span style={visuallyHidden}>Line name for {a.code} {a.name}</span><Input value={value.lineName} maxLength={200} disabled={busy || !value.polarity} onChange={e => edit(a.id, { lineName: e.target.value })} /></label></td><td style={cell}><label><span style={visuallyHidden}>Presentation for {a.code} {a.name}</span><NativeSelect value={value.polarity} disabled={busy} onChange={e => edit(a.id, { polarity: e.target.value as Polarity })}><NativeSelectOption value="">Unmapped</NativeSelectOption><NativeSelectOption value="debit-minus-credit">Debits less credits</NativeSelectOption><NativeSelectOption value="credit-minus-debit">Credits less debits</NativeSelectOption></NativeSelect></label></td></tr> })}</tbody></table></div>}
        <Button disabled={busy || !accounts.length}>{busy ? <SpinnerLabel>Review working paper</SpinnerLabel> : 'Review working paper'}</Button>
      </section>
    </form>}
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <section className="record-panel" aria-labelledby="worksheet-result"><h2 id="worksheet-result">Working paper review</h2><p>{result.mode === 'position' ? `Position through ${result.endDate}` : `Activity from ${result.startDate} through ${result.endDate}`}, inclusive · snapshot {result.snapshotAt} UTC. The report reflects records available at capture; later backdated entries may change a new report. Amounts are integer minor units in the stated currency. Review the mappings and unmapped accounts before use.</p><Button type="button" onClick={download}>Download working paper CSV</Button><p>Import CSV columns as text to preserve account codes and large amounts. Protective apostrophes may appear.</p>
      <h3>Mapped lines</h3>{!result.lines.length ? <p>No accounts were mapped.</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr>{['Line', 'Currency', 'Amount (minor units)'].map(h => <th key={h} scope="col" style={cell}>{h}</th>)}</tr></thead><tbody>{result.lines.map((line, i) => <tr key={`${line.currency}-${line.lineName}-${i}`}><td style={cell}>{line.lineName}</td><td style={cell}>{line.currency}</td><td style={cell}>{amount(line.valueMinor)}</td></tr>)}</tbody></table></div>}
      <h3>Account review</h3><div style={{ overflowX: 'auto' }}><table><thead><tr>{['Account', 'Currency', 'Debits', 'Credits', 'Line', 'Presentation', 'Line contribution'].map(h => <th key={h} scope="col" style={cell}>{h}</th>)}</tr></thead><tbody>{result.accounts.map(a => <tr key={a.accountId}><td style={cell}>{a.code} · {a.name}</td><td style={cell}>{a.currency}</td><td style={cell}>{amount(a.debits)}</td><td style={cell}>{amount(a.credits)}</td><td style={cell}>{a.lineName ?? 'Unmapped'}</td><td style={cell}>{a.polarity === 'debit-minus-credit' ? 'Debits less credits' : a.polarity === 'credit-minus-debit' ? 'Credits less debits' : '—'}</td><td style={cell}>{a.valueMinor === null ? '—' : amount(a.valueMinor)}</td></tr>)}</tbody></table></div>
    </section>}
  </main></div>
}
