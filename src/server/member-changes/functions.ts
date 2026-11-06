import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {listMemberChanges,changeMember} from './service'
export const listMemberChangesFn=createServerFn({method:'GET'}).handler(async()=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return listMemberChanges(env.DB,session?.user.id??null)})
export const changeMemberFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return changeMember(env.DB,session?.user.id??null,data)})
