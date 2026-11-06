import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listLoanTerms,recordLoanTerms} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listLoanTermsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listLoanTerms(db,actor)})
export const recordLoanTermsFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return recordLoanTerms(db,actor,data)})
