import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listFundObservations, recordFundObservation, voidFundObservation } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const listFundObservationsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listFundObservations(db,actorId)})
export const recordFundObservationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return recordFundObservation(db,actorId,data)})
export const voidFundObservationFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return voidFundObservation(db,actorId,data)})
