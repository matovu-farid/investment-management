import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listInvestmentStatuses,changeInvestmentStatus} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const listInvestmentStatusesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listInvestmentStatuses(db,actorId)})
export const changeInvestmentStatusFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return changeInvestmentStatus(db,actorId,data)})
