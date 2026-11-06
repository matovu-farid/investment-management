import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {addPledge,addRecoveryEvent,listCollateral} from './service'
async function context(){const [{env},{auth},{createCollateralRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {repo:createCollateralRepository(env.DB),actorId:session?.user.id??null}}
export const listCollateralFn=createServerFn({method:'GET'}).handler(async()=>{const {repo,actorId}=await context();return listCollateral(repo,actorId)})
export const addPledgeFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actorId}=await context();return addPledge(repo,actorId,data)})
export const addRecoveryEventFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {repo,actorId}=await context();return addRecoveryEvent(repo,actorId,data)})
