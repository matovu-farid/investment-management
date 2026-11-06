import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { accountActivity, accountActivityOptions } from './service'
export const accountActivityOptionsFn=createServerFn({method:'GET'}).handler(async()=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return accountActivityOptions(env.DB,session?.user.id??null)})
export const accountActivityFn=createServerFn({method:'GET'}).validator((input:unknown)=>input).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return accountActivity(env.DB,session?.user.id??null,data)})
