import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listUnappliedReceipts, refundUnappliedReceipt, reverseUnappliedRefund } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listUnappliedReceiptsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listUnappliedReceipts(db,actor)})
export const refundUnappliedReceiptFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return refundUnappliedReceipt(db,actor,data)})
export const reverseUnappliedRefundFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseUnappliedRefund(db,actor,data)})
