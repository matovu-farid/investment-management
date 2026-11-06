import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listRepaymentPosting,postRepayment,reverseRepayment} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listRepaymentPostingFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listRepaymentPosting(db,actor)})
export const postRepaymentFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postRepayment(db,actor,data)})
export const reverseRepaymentFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseRepayment(db,actor,data)})
