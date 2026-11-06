import {createServerFn} from '@tanstack/react-start'
import {getRequestHeaders,setResponseHeader} from '@tanstack/react-start/server'
import {listBoardPacketAccess,grantBoardPacketAccess,revokeBoardPacketAccess,listMyBoardPackets} from './service'
function privateResponse(){setResponseHeader('Cache-Control','no-store');setResponseHeader('Referrer-Policy','no-referrer')}
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const listBoardPacketAccessFn=createServerFn({method:'GET'}).handler(async()=>{privateResponse();const {db,actor}=await context();return listBoardPacketAccess(db,actor)})
export const grantBoardPacketAccessFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{privateResponse();const {db,actor}=await context();return grantBoardPacketAccess(db,actor,data)})
export const revokeBoardPacketAccessFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{privateResponse();const {db,actor}=await context();return revokeBoardPacketAccess(db,actor,data)})
export const listMyBoardPacketsFn=createServerFn({method:'GET'}).handler(async()=>{privateResponse();const {db,actor}=await context();return listMyBoardPackets(db,actor)})
