import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {getDashboard} from './service'
export const getDashboardFn=createServerFn({method:'GET'}).handler(async()=>{
 const [{env},{auth},{createDashboardRepository}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth'),import('./repository')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return getDashboard(createDashboardRepository(env.DB),session?.user.id??null)
})
