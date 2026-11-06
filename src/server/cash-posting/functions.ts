import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listCashPosting,postCashEntry,reverseCashEntry,postCashCorrection,reverseCashCorrection} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listCashPostingFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listCashPosting(db,actor)})
export const postCashEntryFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postCashEntry(db,actor,data)})
export const reverseCashEntryFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseCashEntry(db,actor,data)})
export const postCashCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postCashCorrection(db,actor,data)})
export const reverseCashCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseCashCorrection(db,actor,data)})
