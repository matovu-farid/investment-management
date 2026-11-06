import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { uploadDocument, listDocuments, downloadDocument } from '../../src/server/documents/service.ts'

function setup() {
  const records = new Map<string, { body: Uint8Array; customMetadata: Record<string,string> }>()
  const bucket = {
    async put(key: string, body: Uint8Array, options: { customMetadata: Record<string,string>; onlyIf: Headers }) { assert.equal(options.onlyIf.get('if-none-match'), '*'); if(records.has(key)) return null; records.set(key, {body,customMetadata:options.customMetadata}); return {} },
    async head(key: string) { const item=records.get(key); return item ? { key, size:item.body.length, customMetadata:item.customMetadata, uploaded:new Date('2026-01-01') } : null },
    async get(key: string) { const item=records.get(key); return item ? { key, size:item.body.length, customMetadata:item.customMetadata, body:item.body } : null },
    async list() { return {objects:[...records].map(([key,item])=>({key,size:item.body.length,customMetadata:item.customMetadata,uploaded:new Date('2026-01-01')})),truncated:false} },
  }
  return { bucket:bucket as never, records }
}
const input={id:'2361be2d-3643-4b39-bc73-6dce4a52e625',title:'Board policy',filename:'policy.pdf',bytes:new Uint8Array([37,80,68,70,45,49,46,55]),source:'Board',documentDate:'2026-01-01'}

test('admin can store and retrieve an immutable document, retrying identical content',async()=>{
 const {bucket,records}=setup(); const admin=async()=>true
 await uploadDocument(bucket,admin,'admin',input); await uploadDocument(bucket,admin,'admin',input)
 assert.equal(records.size,1); assert.equal((await listDocuments(bucket,admin,'admin')).documents[0].title,'Board policy')
 assert.ok(await downloadDocument(bucket,admin,'admin',input.id))
 await assert.rejects(uploadDocument(bucket,admin,'admin',{...input,title:'Changed'}),/different/i)
 await assert.rejects(uploadDocument(bucket,admin,'admin',{...input,bytes:new Uint8Array([37,80,68,70,45,49])}),/different/i)
})
test('rejects unauthorized access and malformed or non-PDF uploads',async()=>{
 const {bucket,records}=setup(); const denied=async()=>false,admin=async()=>true
 await assert.rejects(uploadDocument(bucket,denied,'member',input),/unauthorized/i)
 await assert.rejects(listDocuments(bucket,denied,'member'),/unauthorized/i)
 await assert.rejects(downloadDocument(bucket,denied,'member',input.id),/unauthorized/i)
 await assert.rejects(uploadDocument(bucket,admin,'admin',{...input,bytes:new Uint8Array([1,2])}),/pdf/i)
 await assert.rejects(uploadDocument(bucket,admin,'admin',{...input,id:'../bad'}),/invalid/i)
 await assert.rejects(uploadDocument(bucket,admin,'admin',{...input,documentDate:'2026-02-30'}),/date/i)
 await assert.rejects(uploadDocument(bucket,admin,'admin',{...input,bytes:new Uint8Array(5 * 1024 * 1024 + 1)}),/pdf/i)
 assert.equal(records.size,0)
})
test('passes opaque cursors through without exposing documents to non-admins',async()=>{
 const seen: unknown[]=[]
 const paged={async list(options:unknown){seen.push(options);return {objects:[],truncated:true,cursor:'next-page'}}} as never
 const page=await listDocuments(paged,async()=>true,'admin','previous-page')
 assert.equal(page.nextCursor,'next-page')
 assert.equal((seen[0] as {cursor:string}).cursor,'previous-page')
 await assert.rejects(listDocuments(paged,async()=>false,'member','previous-page'),/unauthorized/i)
 assert.equal(seen.length,1)
})
