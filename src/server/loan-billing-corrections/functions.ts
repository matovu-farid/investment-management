import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { previewBillingCorrection, correctBillingEvent } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const previewBillingCorrectionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return previewBillingCorrection(db,actor,data)})
export const correctBillingEventFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return correctBillingEvent(db,actor,data)})
