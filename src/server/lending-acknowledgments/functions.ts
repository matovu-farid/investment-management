import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders,setResponseHeader} from '@tanstack/react-start/server'
import {getAcknowledgment} from './service'

export const acknowledgmentFn=createServerFn({method:'GET'}).validator((data:unknown)=>data).handler(async({data})=>{
 setResponseHeader('Cache-Control','private, no-store')
 setResponseHeader('Referrer-Policy','no-referrer')
 const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')])
 const session=await auth.api.getSession({headers:getRequestHeaders()})
 return getAcknowledgment(env.DB,session?.user.id??null,data)
})
