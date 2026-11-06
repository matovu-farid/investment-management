import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders} from '@tanstack/react-start/server'
import {getCreditReview,listCreditReviewMembers} from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listCreditReviewMembersFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listCreditReviewMembers(db,actor)})
export const getCreditReviewFn=createServerFn({method:'GET'}).validator((data:unknown)=>data).handler(async({data})=>{const {db,actor}=await context();return getCreditReview(db,actor,data)})
