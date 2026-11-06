import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {createTrade,listTrades} from './service'
async function context(){const [{env},{auth},{createTradeRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {repo:createTradeRepository(env.DB),actorId:session?.user.id??null}}
export const listTradesFn=createServerFn({method:'GET'}).handler(async()=>{const {repo,actorId}=await context();return listTrades(repo,actorId)})
export const createTradeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actorId}=await context();return createTrade(repo,actorId,data)})
