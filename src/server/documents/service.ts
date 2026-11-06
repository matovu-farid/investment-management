const PREFIX = 'supporting-documents/'
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type AdminCheck = (actor: string) => Promise<boolean>
type Upload = { id: string; title: string; filename: string; bytes: Uint8Array; source: string; documentDate: string }

async function authorize(check: AdminCheck, actor: string | null): Promise<string> {
  if (!actor || !await check(actor)) throw new Error('Unauthorized')
  return actor
}
function keyFor(id: string) {
  if (!UUID.test(id)) throw new Error('Invalid document identifier')
  return PREFIX + id.toLowerCase()
}
function text(value: string, limit: number, required = true) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value) || value.trim().length > limit || (required && !value.trim())) throw new Error('Invalid document details')
  return value.trim()
}
function date(value: string) {
  if (!value) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Invalid document date')
  return value
}
function details(object: R2Object) {
  const metadata = object.customMetadata || {}
  return { id: object.key.slice(PREFIX.length), title: metadata.title || '', filename: metadata.filename || '', source: metadata.source || '', documentDate: metadata.documentDate || '', uploadedAt: object.uploaded.toISOString(), size: object.size }
}

export async function uploadDocument(bucket: R2Bucket, check: AdminCheck, actor: string | null, input: Upload) {
  const user = await authorize(check, actor)
  if (!input || typeof input !== 'object') throw new Error('Invalid document')
  const key = keyFor(input.id), title = text(input.title, 200), filename = text(input.filename, 180), source = text(input.source, 300, false), documentDate = date(input.documentDate)
  if (!/\.pdf$/i.test(filename) || !(input.bytes instanceof Uint8Array) || input.bytes.length < 5 || input.bytes.length > MAX_DOCUMENT_BYTES || ![37,80,68,70,45].every((b, i) => input.bytes[i] === b)) throw new Error('Choose a PDF file no larger than 5 MB')
  const content = new Uint8Array(input.bytes)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', content))).map(n => n.toString(16).padStart(2, '0')).join('')
  const metadata = { title, filename, source, documentDate, hash, createdBy: user }
  await bucket.put(key, content.buffer, { onlyIf: new Headers({ 'If-None-Match': '*' }), customMetadata: metadata, httpMetadata: { contentType: 'application/pdf' } })
  const saved = await bucket.head(key)
  if (!saved || Object.entries(metadata).some(([name, value]) => saved.customMetadata?.[name] !== value)) throw new Error('Document request already used for different details')
  return details(saved)
}

export async function listDocuments(bucket: R2Bucket, check: AdminCheck, actor: string | null, cursor?: string) {
  await authorize(check, actor)
  if (cursor && (cursor.length > 4096 || /[\u0000-\u001f\u007f]/.test(cursor))) throw new Error('Invalid cursor')
  const result = await bucket.list({ prefix: PREFIX, include: ['customMetadata'], limit: 100, ...(cursor ? { cursor } : {}) })
  return { documents: result.objects.filter(item => UUID.test(item.key.slice(PREFIX.length))).map(details), nextCursor: result.truncated ? result.cursor : null }
}

export async function downloadDocument(bucket: R2Bucket, check: AdminCheck, actor: string | null, id: string) {
  await authorize(check, actor)
  return bucket.get(keyFor(id))
}
