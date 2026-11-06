import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {recordHoldingObservation,voidHoldingObservation,publishHoldingObservation,withdrawHoldingObservation,listAdminHoldingObservations,listMemberHoldingObservations} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const adminHoldingObservationsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listAdminHoldingObservations(db,actorId)})
export const memberHoldingObservationsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberHoldingObservations(db,actorId)})
export const recordHoldingObservationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return recordHoldingObservation(db,actorId,data)})
export const voidHoldingObservationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return voidHoldingObservation(db,actorId,data)})
export const publishHoldingObservationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishHoldingObservation(db,actorId,data)})
export const withdrawHoldingObservationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawHoldingObservation(db,actorId,data)})
