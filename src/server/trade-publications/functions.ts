import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listAdminTradePublications,listMemberTradePublications,publishTrade,withdrawTrade} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return{db:env.DB,actorId:session?.user.id??null}}
export const listAdminTradePublicationsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminTradePublications(db,actorId)})
export const listMemberTradePublicationsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberTradePublications(db,actorId)})
export const publishTradeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishTrade(db,actorId,data)})
export const withdrawTradeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawTrade(db,actorId,data)})
