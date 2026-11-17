import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {getAllocationData} from './service'
export const allocationDataFn=createServerFn({method:'GET'}).handler(async()=>{
 const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return getAllocationData(env.DB,session?.user.id??null)
})

export const portfolioOptionsFn=createServerFn({method:'GET'}).handler(async()=>{
 const [{env},{auth},{statementWorksheetOptions}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('../statement-worksheet/service')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return statementWorksheetOptions(env.DB,session?.user.id??null)
})
export const reviewPortfolioFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{
 const [{env},{auth},{reviewPortfolioAllocation}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./portfolio-review')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return reviewPortfolioAllocation(env.DB,session?.user.id??null,data as Parameters<typeof reviewPortfolioAllocation>[2])
})
