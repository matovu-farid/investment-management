import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listReportedLoanBalances, recordReportedLoanBalance, voidReportedLoanBalance } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const listReportedLoanBalancesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listReportedLoanBalances(db,actorId)})
export const recordReportedLoanBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return recordReportedLoanBalance(db,actorId,data)})
export const voidReportedLoanBalanceFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return voidReportedLoanBalance(db,actorId,data)})
