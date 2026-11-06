import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listBookingStatuses,changeBookingStatus} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listBookingStatusesFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listBookingStatuses(db,actor)})
export const changeBookingStatusFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return changeBookingStatus(db,actor,data)})
