import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {previewLendingImport,importLending} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const previewLendingImportFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return previewLendingImport(db,actor,data)})
export const importLendingFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return importLending(db,actor,data)})
