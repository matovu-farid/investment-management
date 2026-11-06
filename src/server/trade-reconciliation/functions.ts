import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {linkTradeReconciliation,listTradeReconciliation,revokeTradeReconciliation} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listTradeReconciliationFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listTradeReconciliation(db,actor)})
export const linkTradeReconciliationFn=createServerFn({method:'POST'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return linkTradeReconciliation(db,actor,data)})
export const revokeTradeReconciliationFn=createServerFn({method:'POST'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return revokeTradeReconciliation(db,actor,data)})
