import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {previewCapacityPublication,publishCapacity,listMemberCapacity,listAdminCapacity,withdrawCapacity} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const previewCapacityPublicationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return previewCapacityPublication(db,actorId,data)})
export const publishCapacityFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishCapacity(db,actorId,data)})
export const listMemberCapacityFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberCapacity(db,actorId)})
export const listAdminCapacityFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminCapacity(db,actorId)})
export const withdrawCapacityFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawCapacity(db,actorId,data)})
