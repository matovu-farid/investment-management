import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders,setResponseHeader} from '@tanstack/react-start/server'
function privateResponse(){setResponseHeader('Cache-Control','no-store');setResponseHeader('Referrer-Policy','no-referrer')}
import {issueAndDeliverInvitation,issueStaffInvitation,listStaffInvitations,revokeStaffInvitation,listInvitations,revokeInvitation,claimInvitation} from './service'
import {createInvitationDelivery, type InvitationDeliveryEnvironment} from '../../lib/invitation-delivery'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const issueInvitationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{
 privateResponse()
 const {db,actorId}=await context()
 const {env}=await import('cloudflare:workers')
 const delivery=createInvitationDelivery(env as typeof env & InvitationDeliveryEnvironment,env.BETTER_AUTH_URL)
 return issueAndDeliverInvitation(db,actorId,data,delivery)
})
export const issueStaffInvitationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{privateResponse();const {db,actorId}=await context();const {env}=await import('cloudflare:workers');return issueStaffInvitation(db,actorId,data,createInvitationDelivery(env as typeof env & InvitationDeliveryEnvironment,env.BETTER_AUTH_URL))})
export const listStaffInvitationsFn=createServerFn({method:'GET'}).handler(async()=>{privateResponse();const {db,actorId}=await context();return listStaffInvitations(db,actorId)})
export const revokeStaffInvitationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{privateResponse();const {db,actorId}=await context();return revokeStaffInvitation(db,actorId,data)})
export const listInvitationsFn=createServerFn({method:'GET'}).handler(async()=>{privateResponse();const {db,actorId}=await context();return listInvitations(db,actorId)})
export const revokeInvitationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{privateResponse();const {db,actorId}=await context();return revokeInvitation(db,actorId,data)})
export const claimInvitationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{privateResponse();const {env}=await import('cloudflare:workers');const headers=getRequestHeaders();let ip=headers.get('cf-connecting-ip');if(!ip && /^http:\/\/localhost(?::\d+)?$/.test(env.BETTER_AUTH_URL))ip='127.0.0.1';return claimInvitation(env.DB,data,ip)})
