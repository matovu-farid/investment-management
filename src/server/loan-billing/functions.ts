import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listLoanBilling, configureLoanBilling, cancelLoanBillingConfig, previewLoanBilling, commitLoanBilling, addBillingRateChange, voidBillingRateChange } from './service'

async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listLoanBillingFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listLoanBilling(db,actor)})
export const configureLoanBillingFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return configureLoanBilling(db,actor,data)})
export const cancelLoanBillingConfigFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return cancelLoanBillingConfig(db,actor,data)})
export const previewLoanBillingFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return previewLoanBilling(db,actor,data)})
export const projectLoanScheduleFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();const {projectLoanSchedule}=await import('./projection');return projectLoanSchedule(db,actor,data)})
export const commitLoanBillingFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return commitLoanBilling(db,actor,data)})
export const addBillingRateChangeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return addBillingRateChange(db,actor,data)})
export const voidBillingRateChangeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();return voidBillingRateChange(db,actor,data)})
export const listLegacyBillingTermsFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();const {listLegacyBillingTerms}=await import('./legacy');return listLegacyBillingTerms(db,actor,data)})
export const configureLegacyLoanBillingFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actor}=await context();const {configureLegacyLoanBilling}=await import('./legacy');return configureLegacyLoanBilling(db,actor,data)})
