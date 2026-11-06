import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listCorrectionWork,postCorrection,reverseCorrection} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return{db:env.DB,actor:session?.user.id??null}}
export const listCorrectionsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listCorrectionWork(db,actor)})
export const postCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postCorrection(db,actor,data)})
export const reverseCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseCorrection(db,actor,data)})
