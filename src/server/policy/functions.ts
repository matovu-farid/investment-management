import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { addPolicyTarget, listPolicyTargets } from './service'
import { correctPolicyTarget, listPolicyCorrections } from './corrections'
async function context() {
 const [{env},{auth},{createPolicyRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return {repo:createPolicyRepository(env.DB),actorId:session?.user.id ?? null}
}
export const listPolicyTargetsFn=createServerFn({method:'GET'}).handler(async()=>{const {repo,actorId}=await context();return listPolicyTargets(repo,actorId)})
export const addPolicyTargetFn=createServerFn({method:'POST'}).validator((value:unknown)=>value).handler(async({data})=>{const {repo,actorId}=await context();return addPolicyTarget(repo,actorId,data)})
export const correctPolicyTargetFn=createServerFn({method:'POST'}).validator((value:unknown)=>value).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return correctPolicyTarget(env.DB,session?.user.id??null,data)})
export const listPolicyCorrectionsFn=createServerFn({method:'POST'}).validator((value:unknown)=>value).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return listPolicyCorrections(env.DB,session?.user.id??null,data)})
