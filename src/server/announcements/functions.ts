import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { listMemberAnnouncements,listAdminAnnouncements,listAdminSales,listPublishableExtensions,listPublishedExtensions,publishAnnouncement,publishExtension,withdrawAnnouncement,submitMemberInterest,listMemberInterests } from './service'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actorId:session?.user.id??null}}
export const memberAnnouncementsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberAnnouncements(db,actorId)})
export const adminAnnouncementsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();const [sales,announcements,extensions,publishedExtensions]=await Promise.all([listAdminSales(db,actorId),listAdminAnnouncements(db,actorId),listPublishableExtensions(db,actorId),listPublishedExtensions(db,actorId)]);return {sales,announcements,extensions,publishedExtensions}})
export const publishAnnouncementFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishAnnouncement(db,actorId,data)})
export const withdrawAnnouncementFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return withdrawAnnouncement(db,actorId,data)})
export const publishExtensionFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return publishExtension(db,actorId,data)})
export const submitMemberInterestFn=createServerFn({method:'POST'}).validator((v:unknown)=>v).handler(async({data})=>{const {db,actorId}=await context();return submitMemberInterest(db,actorId,data)})
export const memberInterestsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actorId}=await context();return listMemberInterests(db,actorId)})
