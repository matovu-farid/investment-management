import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listInvestmentPosting,postInvestmentTransaction,reverseInvestmentTransaction} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listInvestmentPostingFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listInvestmentPosting(db,actor)})
export const postInvestmentTransactionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postInvestmentTransaction(db,actor,data)})
export const reverseInvestmentTransactionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseInvestmentTransaction(db,actor,data)})
