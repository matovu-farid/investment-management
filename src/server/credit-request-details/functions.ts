import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listDetails,saveDetails} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listCreditRequestDetailsFn=createServerFn({method:'GET'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return listDetails(db,actor,data)})
export const saveCreditRequestDetailsFn=createServerFn({method:'POST'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return saveDetails(db,actor,data)})
