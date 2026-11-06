import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listObligations,recordObligation,voidObligation} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const listObligationsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listObligations(db,actorId)})
export const recordObligationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return recordObligation(db,actorId,data)})
export const voidObligationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return voidObligation(db,actorId,data)})
