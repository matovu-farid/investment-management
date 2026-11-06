import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {addStatusEvent,listBookingHistory} from './service'
async function context(){const [{env},{auth},{createBookingHistoryRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {repo:createBookingHistoryRepository(env.DB),actorId:session?.user.id??null}}
export const listBookingHistoryFn=createServerFn({method:'GET'}).handler(async()=>{const {repo,actorId}=await context();return listBookingHistory(repo,actorId)})
export const addStatusEventFn=createServerFn({method:'POST'}).validator((value:unknown)=>value).handler(async({data})=>{const {repo,actorId}=await context();return addStatusEvent(repo,actorId,data)})
