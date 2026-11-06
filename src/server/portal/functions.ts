import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { readMyPortfolio, linkMember, listLinkOptions, revokeMemberLink } from './service'
async function context() {
 const [{env},{auth}] = await Promise.all([import('cloudflare:workers'),import('../../lib/auth')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return {db:env.DB,actorId:session?.user.id??null}
}
export const myPortfolioFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context(); return readMyPortfolio(db,actorId)})
export const linkOptionsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context(); return listLinkOptions(db,actorId)})
export const linkMemberFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const {db,actorId}=await context(); return linkMember(db,actorId,data)})

export const revokeLinkFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const {db,actorId}=await context(); return revokeMemberLink(db,actorId,data)})
