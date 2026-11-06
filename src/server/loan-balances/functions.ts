import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listAdminLoanBalances,listMemberLoanBalances,publishLoanBalance,publishObservedLoanBalance,withdrawLoanBalance} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const adminLoanBalancesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminLoanBalances(db,actorId)})
export const memberLoanBalancesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberLoanBalances(db,actorId)})
export const publishLoanBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishLoanBalance(db,actorId,data)})
export const withdrawLoanBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawLoanBalance(db,actorId,data)})

export const publishObservedLoanBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishObservedLoanBalance(db,actorId,data)})
