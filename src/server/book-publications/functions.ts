import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {previewBooks,publishBooks,listAdminBooks,listMemberBooks,withdrawBooks} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const previewBooksFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return previewBooks(db,actorId,data)})
export const publishBooksFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishBooks(db,actorId,data)})
export const adminBooksFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminBooks(db,actorId)})
export const memberBooksFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberBooks(db,actorId)})
export const withdrawBooksFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawBooks(db,actorId,data)})
