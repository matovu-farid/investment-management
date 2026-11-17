import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { correctLoanOpening, listLoanOpenings, postLoanOpening } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listLoanOpeningsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listLoanOpenings(db,actor)})
export const postLoanOpeningFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return postLoanOpening(db,actor,data)})
export const correctLoanOpeningFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return correctLoanOpening(db,actor,data)})
export const setBillingOpeningStateFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();const {setBillingOpeningState}=await import('./billing-state');return setBillingOpeningState(db,actor,data)})
export const correctBillingOpeningStateFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();const {correctBillingOpeningState}=await import('./billing-state');return correctBillingOpeningState(db,actor,data)})
