import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const reviewCreditRiskFn=createServerFn({method:'POST'}).validator((value:unknown)=>value).handler(async({data})=>{
 const [{env},{auth},{reviewCreditRisk}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./service')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return reviewCreditRisk(env.DB,session?.user.id??null,data)
})
