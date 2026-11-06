import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {holdingImportOptions,previewHoldingImport,importHoldings} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const holdingImportOptionsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return holdingImportOptions(db,actor)})
export const previewHoldingImportFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return previewHoldingImport(db,actor,data)})
export const importHoldingsFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return importHoldings(db,actor,data)})
