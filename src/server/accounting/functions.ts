import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { createAccount, listLedger, postManualJournal, reverseManualJournal } from './ledger'
async function context() {
  const [{env},{auth}] = await Promise.all([import('cloudflare:workers'),import('../../lib/auth')])
  const session=await auth.api.getSession({headers:getRequestHeaders()})
  return { db:env.DB, actorId:session?.user.id ?? null }
}
export const listLedgerFn=createServerFn({method:'GET'}).handler(async()=>{ const {db,actorId}=await context(); return listLedger(db,actorId) })
export const createAccountFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{ const {db,actorId}=await context(); return createAccount(db,actorId,data) })
export const postManualJournalFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{ const {db,actorId}=await context(); return postManualJournal(db,actorId,data) })
export const reverseManualJournalFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{ const {db,actorId}=await context(); return reverseManualJournal(db,actorId,data) })
