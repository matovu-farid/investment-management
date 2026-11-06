import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listCashEntries, recordCashEntry, voidCashEntry } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const listCashEntriesFn=createServerFn({method:'GET'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return listCashEntries(db,actorId,data)})
export const recordCashEntryFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return recordCashEntry(db,actorId,data)})
export const voidCashEntryFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return voidCashEntry(db,actorId,data)})
