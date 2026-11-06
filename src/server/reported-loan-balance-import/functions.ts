import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {previewReportedLoanBalanceImport,importReportedLoanBalances} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const previewReportedLoanBalanceImportFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return previewReportedLoanBalanceImport(db,actor,data)})
export const importReportedLoanBalancesFn=createServerFn({method:'POST'}).validator((x:unknown)=>x).handler(async({data})=>{const {db,actor}=await context();return importReportedLoanBalances(db,actor,data)})
