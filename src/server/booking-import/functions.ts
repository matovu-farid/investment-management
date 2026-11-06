import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {previewBookingImport,importBookings} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const previewBookingImportFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return previewBookingImport(db,actor,data)})
export const importBookingFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return importBookings(db,actor,data)})
