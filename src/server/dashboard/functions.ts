import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders,setResponseHeader} from '@tanstack/react-start/server'
import {getDashboard} from './service'
export const getDashboardFn=createServerFn({method:'GET'}).handler(async()=>{
 const [{env},{auth},{createDashboardRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return getDashboard(createDashboardRepository(env.DB),session?.user.id??null)
})

// Return all dashboard data in one request and resolve the session just once.
// The underlying services still enforce their independent role/member guards.
export const getWorkspaceFn=createServerFn({method:'GET'}).handler(async()=>{
 setResponseHeader('Cache-Control','private, no-store')
 const [{env},{auth},{createDashboardRepository},{listFundObservations},{listMemberShareValues},{loadWorkspace}]=await Promise.all([
  import('cloudflare:workers'),import('../../lib/auth'),import('./repository'),
  import('../fund-observations/service'),import('../share-values/service'),import('./workspace'),
 ])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return loadWorkspace(session?.user??null,{
  overview:actor=>getDashboard(createDashboardRepository(env.DB),actor),
  funds:actor=>listFundObservations(env.DB,actor),
  shares:actor=>listMemberShareValues(env.DB,actor),
 })
})
