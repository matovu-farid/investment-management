import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {addBudget,listBudgetData,voidBudget,compareBudget} from './service'
async function context(){const [{env},{auth},{createBudgetRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {repo:createBudgetRepository(env.DB),actor:session?.user.id??null}}
export const budgetDataFn=createServerFn({method:'GET'}).handler(async()=>{const {repo,actor}=await context();return listBudgetData(repo,actor)})
export const addBudgetFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actor}=await context();return addBudget(repo,actor,data)})
export const voidBudgetFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actor}=await context();return voidBudget(repo,actor,data)})
export const compareBudgetFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actor}=await context();return compareBudget(repo,actor,data)})
