import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {getAllocationData} from './service'
export const allocationDataFn=createServerFn({method:'GET'}).handler(async()=>{
 const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return getAllocationData(env.DB,session?.user.id??null)
})
