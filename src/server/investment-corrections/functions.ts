import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listInvestmentCorrectionWork,postInvestmentCorrection,reverseInvestmentCorrection} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listInvestmentCorrectionWorkFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listInvestmentCorrectionWork(db,actor)})
export const postInvestmentCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postInvestmentCorrection(db,actor,data)})
export const reverseInvestmentCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return reverseInvestmentCorrection(db,actor,data)})
