import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listAdminShareValues,listMemberShareValues,publishShareValue,withdrawShareValue} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const adminShareValuesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminShareValues(db,actorId)})
export const memberShareValuesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberShareValues(db,actorId)})
export const publishShareValueFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishShareValue(db,actorId,data)})
export const withdrawShareValueFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawShareValue(db,actorId,data)})
