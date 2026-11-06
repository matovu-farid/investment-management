import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listLoanPosting, postLoanDisbursement, reverseLoanDisbursement } from './service'
async function context(){
 const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return {db:env.DB,actor:session?.user.id??null}
}
export const listLoanPostingFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listLoanPosting(db,actor)})
export const postLoanDisbursementFn=createServerFn({method:'POST'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return postLoanDisbursement(db,actor,data)})

export const reverseLoanDisbursementFn=createServerFn({method:'POST'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return reverseLoanDisbursement(db,actor,data)})
