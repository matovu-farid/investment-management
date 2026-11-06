import { createFileRoute } from '@tanstack/react-router'
import { MAX_DOCUMENT_BYTES, downloadDocument, listDocuments, uploadDocument } from '#/server/documents/service'

async function context(request: Request) {
  const [{ env }, { auth }] = await Promise.all([import('cloudflare:workers'), import('#/lib/auth')])
  const session = await auth.api.getSession({ headers: request.headers })
  const bucket = (env as Env & { RNIG_DOCUMENTS?: R2Bucket }).RNIG_DOCUMENTS
  const check = async (actor: string) => (await env.DB.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actor).first<{role:string}>())?.role === 'admin'
  return { actor: session?.user.id ?? null, bucket, check }
}
function response(message: string, status: number) { return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }) }
async function readBounded(request: Request): Promise<Uint8Array> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_DOCUMENT_BYTES)) throw new Error('Document is too large')
  if (!request.body) throw new Error('No document provided')
  const reader = request.body.getReader(), parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new Error('Document is too large') }
      parts.push(next.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return bytes
}
function header(request: Request, name: string) { return decodeURIComponent(request.headers.get(name) || '') }

export const Route = createFileRoute('/api/documents')({
  server: { handlers: {
    GET: async ({ request }) => {
      const { actor, bucket, check } = await context(request)
      if (!actor || !await check(actor)) return response('Access unavailable', 403)
      if (!bucket) return response('Document storage is unavailable', 503)
      const url = new URL(request.url), id = url.searchParams.get('id'), cursor = url.searchParams.get('cursor') || undefined
      try {
        if (!id) return Response.json(await listDocuments(bucket, check, actor, cursor), { headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
        const object = await downloadDocument(bucket, check, actor, id)
        if (!object) return response('Document not found', 404)
        return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="document-${id}.pdf"`, 'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
      } catch { return response('Document unavailable', 404) }
    },
    POST: async ({ request }) => {
      if (request.headers.get('origin') !== new URL(request.url).origin) return response('Invalid request origin', 403)
      const { actor, bucket, check } = await context(request)
      if (!actor || !await check(actor)) return response('Access unavailable', 403)
      if (!bucket) return response('Document storage is unavailable', 503)
      if (request.headers.get('content-type') !== 'application/pdf') return response('Choose a PDF file', 415)
      try {
        const id = header(request, 'x-document-id'), title = header(request, 'x-document-title'), filename = header(request, 'x-document-filename'), source = header(request, 'x-document-source'), documentDate = header(request, 'x-document-date')
        const document = await uploadDocument(bucket, check, actor, { id, title, filename, source, documentDate, bytes: await readBounded(request) })
        return Response.json({ document }, { headers: { 'Cache-Control': 'private, no-store' } })
      } catch { return response('Document could not be recorded. Check the PDF and details, then retry unchanged.', 400) }
    },
  } },
})
