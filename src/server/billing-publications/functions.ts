import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listAdminCalculatedBalances,listMemberCalculatedBalances,previewCalculatedBalance,publishCalculatedBalance,withdrawCalculatedBalance} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const adminCalculatedBalancesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminCalculatedBalances(db,actorId)})
export const memberCalculatedBalancesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberCalculatedBalances(db,actorId)})
export const previewCalculatedBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return previewCalculatedBalance(db,actorId,data)})
export const publishCalculatedBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishCalculatedBalance(db,actorId,data)})
export const withdrawCalculatedBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawCalculatedBalance(db,actorId,data)})
