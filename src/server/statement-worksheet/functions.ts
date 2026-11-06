import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { statementWorksheet, statementWorksheetOptions } from './service'
export const statementWorksheetOptionsFn=createServerFn({method:'GET'}).handler(async()=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return statementWorksheetOptions(env.DB,session?.user.id??null)})
export const statementWorksheetFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return statementWorksheet(env.DB,session?.user.id??null,data)})
