import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {voidCollateral} from './service'
export const voidCollateralFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return voidCollateral(env.DB,session?.user.id??null,data)})
