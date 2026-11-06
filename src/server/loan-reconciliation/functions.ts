import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {loanReconciliation} from './service'
export const loanReconciliationFn=createServerFn({method:'GET'}).handler(async()=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return loanReconciliation(env.DB,session?.user.id??null)})
