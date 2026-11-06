import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {addInterest,addStatus,createSale,listSales} from './service'
async function context(){const [{env},{auth},{createSaleRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {repo:createSaleRepository(env.DB),actorId:session?.user.id??null}}
export const listSalesFn=createServerFn({method:'GET'}).handler(async()=>{const {repo,actorId}=await context();return listSales(repo,actorId)})
export const createSaleFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actorId}=await context();return createSale(repo,actorId,data)})
export const addInterestFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actorId}=await context();return addInterest(repo,actorId,data)})
export const addStatusFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actorId}=await context();return addStatus(repo,actorId,data)})
