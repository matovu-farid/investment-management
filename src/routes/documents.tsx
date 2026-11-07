import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { confirmAction } from '#/components/confirmation-host'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { DatePickerInput } from '#/components/ui/date-picker'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/documents')({
  beforeLoad: async () => { if (!await getSession()) throw redirect({ to: '/login' }) },
  component: Documents,
})
type DocumentRow = { id: string; title: string; filename: string; source: string; documentDate: string; replacesId: string; replacementReason: string; recordedBy: string; uploadedAt: string; size: number }
type List = { documents: DocumentRow[]; nextCursor: string | null }
type Pending = { id: string; title: string; source: string; documentDate: string; file: File; replacesId: string; replacementReason: string }

function Documents() {
  const [list, setList] = useState<List | null>(null)
  const [available, setAvailable] = useState(true), [loading, setLoading] = useState(true)
  const [title, setTitle] = useState(''), [source, setSource] = useState(''), [documentDate, setDate] = useState('')
  const [replacement, setReplacement] = useState<DocumentRow | null>(null), [replacementReason, setReplacementReason] = useState('')
  const [file, setFile] = useState<File | null>(null), [fileKey, setFileKey] = useState(0)
  const [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  async function refresh() {
    const result = await fetch('/api/documents', { cache: 'no-store' })
    if (!result.ok) throw new Error('Document register unavailable')
    setList(await result.json() as List); setAvailable(true)
  }
  async function loadMore() {
    if (!list?.nextCursor) return
    setBusy(true); setError('')
    try {
      const result = await fetch(`/api/documents?cursor=${encodeURIComponent(list.nextCursor)}`, { cache: 'no-store' })
      if (!result.ok) throw new Error('Unavailable')
      const page = await result.json() as List
      setList(current => current ? { documents: [...current.documents, ...page.documents], nextCursor: page.nextCursor } : page)
    } catch { setError('More documents could not be loaded. Try again.') }
    finally { setBusy(false) }
  }
  useEffect(() => { let active = true; fetch('/api/documents', { cache: 'no-store' }).then(async result => { if (!result.ok) throw new Error('Unavailable'); const data = await result.json() as List; if (active) setList(data) }).catch(() => { if (active) setAvailable(false) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  async function send(request: Pending) {
    setPending(request); setBusy(true); setError(''); setMessage('')
    try {
      const result = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Document-Id': encodeURIComponent(request.id), 'X-Document-Title': encodeURIComponent(request.title), 'X-Document-Filename': encodeURIComponent(request.file.name), 'X-Document-Source': encodeURIComponent(request.source), 'X-Document-Date': encodeURIComponent(request.documentDate), 'X-Document-Replaces': encodeURIComponent(request.replacesId), 'X-Document-Replacement-Reason': encodeURIComponent(request.replacementReason) }, body: request.file })
      if (!result.ok) throw new Error('Not confirmed')
      setPending(null); setFile(null); setFileKey(n => n + 1); setTitle(''); setSource(''); setDate(''); setReplacement(null); setReplacementReason(''); setMessage('Document recorded.')
      try { await refresh() } catch { setMessage('Document recorded. Reload this page to refresh the register.') }
    } catch { setError('The upload was not confirmed. Retry the same request, or check the register before discarding it.') }
    finally { setBusy(false) }
  }
  async function discard() { if (await confirmAction('This document may already have been recorded. Check the register before discarding this request. Discard it?')) { setPending(null); setError('') } }
  function submit(event: React.FormEvent) {
    event.preventDefault(); setError('')
    if (!file || !/\.pdf$/i.test(file.name) || file.size < 5 || file.size > 5 * 1024 * 1024) { setError('Choose a PDF file no larger than 5 MB.'); return }
    if (replacement && !replacementReason.trim()) { setError('Enter a reason for the replacement.'); return }
    void send({ id: crypto.randomUUID(), title: title.trim(), source: source.trim(), documentDate, file, replacesId: replacement?.id || '', replacementReason: replacement ? replacementReason.trim() : '' })
  }
  return <div className="app"><header><Link to="/" className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Supporting documents</h1><p className="lead">Keep source documents such as the investment policy and board materials together.</p>
    <Alert className="mt-6"><AlertDescription>Documents here are available to administrators only. Uploading does not approve the document or publish it to members.</AlertDescription></Alert>
    {loading ? <p role="status">Loading documents…</p> : !available ? <Alert variant="destructive" className="mt-6"><AlertDescription>The document register is unavailable or your access could not be confirmed.</AlertDescription></Alert> : <>
      {error && <Alert variant="destructive" className="mt-6"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status" className="mt-6"><AlertDescription>{message}</AlertDescription></Alert>}
      <Card className="mt-6"><CardHeader><CardTitle>{replacement ? 'Record a replacement' : 'Record a document'}</CardTitle><CardDescription>PDF only, up to 5 MB. Add a source and document date when known.</CardDescription></CardHeader><CardContent>
        {pending ? <div className="flex flex-col gap-3"><p>Pending request: {pending.title} · {pending.file.name}{pending.replacesId ? ` · replaces document ${pending.replacesId}` : ''}. The file is kept in this page until the request is confirmed or discarded.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void send(pending)}>Retry unchanged</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void discard()}>Discard request</Button></div></div> : <form onSubmit={submit} className="max-w-xl"><FieldGroup>
          {replacement && <Field><Alert><AlertDescription>Replacing {replacement.title} · {replacement.id}. The previous document remains available; recording a replacement does not approve it.</AlertDescription></Alert><Button type="button" variant="outline" onClick={() => { setReplacement(null); setReplacementReason('') }}>Cancel replacement</Button></Field>}
          <Field><FieldLabel htmlFor="document-title">Title</FieldLabel><Input id="document-title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="document-source">Source or approval reference (optional)</FieldLabel><Input id="document-source" maxLength={300} value={source} onChange={e => setSource(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="document-date">Document date (optional)</FieldLabel><DatePickerInput id="document-date" value={documentDate} onChange={e => setDate(e.target.value)} /></Field>
          {replacement && <Field><FieldLabel htmlFor="replacement-reason">Reason for replacement</FieldLabel><Input id="replacement-reason" required maxLength={500} value={replacementReason} onChange={e => setReplacementReason(e.target.value)} /></Field>}
          <Field><FieldLabel htmlFor="document-file">PDF document</FieldLabel><Input key={fileKey} id="document-file" type="file" accept="application/pdf,.pdf" required onChange={e => setFile(e.target.files?.[0] || null)} /></Field>
          <Button disabled={busy}>{busy ? 'Uploading…' : 'Record document'}</Button>
        </FieldGroup></form>}
      </CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Recorded documents ({list?.documents.length ?? 0})</CardTitle><CardDescription>Files are private to administrators. Replacement links record relationships; they do not establish an approved or latest document. Load all pages to review all recorded replacements.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        {!list?.documents.length && !list?.nextCursor ? <p>No documents recorded yet.</p> : list?.documents.map(item => <article id={`document-${item.id}`} key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div className="min-w-0 break-words"><h3>{item.title}</h3><p>{item.filename} · {item.size < 1024 ? `${item.size} bytes` : `${(item.size / 1024).toFixed(1)} KB`}</p><p>{item.documentDate || 'Date not recorded'} · {item.source || 'Source not recorded'}</p><p>Recorded {item.uploadedAt} UTC{item.recordedBy ? ` · account ${item.recordedBy}` : ''}</p>{item.replacesId && <p>Replaces document {item.replacesId} · Reason: {item.replacementReason} · <a href={`/api/documents?id=${encodeURIComponent(item.replacesId)}`}>Download previous document</a></p>}{list.documents.filter(row => row.replacesId === item.id).map(row => <p key={row.id}>Recorded replacement: <a href={`#document-${row.id}`}>{row.title}</a></p>)}</div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><a href={`/api/documents?id=${encodeURIComponent(item.id)}`}>Download PDF</a></Button><Button type="button" variant="outline" disabled={busy || !!pending} onClick={() => { setReplacement(item); setReplacementReason(''); document.getElementById('document-title')?.focus() }}>Record replacement</Button></div></article>)}
        {list?.nextCursor && <Button variant="outline" disabled={busy} onClick={() => void loadMore()}>{busy ? 'Loading…' : 'Load more documents'}</Button>}
      </CardContent></Card>
    </>}
  </main></div>
}
