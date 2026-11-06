import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {lendingSnapshot} from './service'
export const lendingSnapshotFn=createServerFn({method:'GET'}).validator((input:unknown)=>input).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return lendingSnapshot(env.DB,session?.user.id??null,data)})
