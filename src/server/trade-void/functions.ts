import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listTradeVoidOptions,voidTrade} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listTradeVoidOptionsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listTradeVoidOptions(db,actor)})
export const voidTradeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return voidTrade(db,actor,data)})
