import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { previewBoardPacket, saveBoardPacket, listBoardPackets, boardPacketOptions } from './service'
import { startBoardRiskCapture, advanceBoardRiskCapture } from './risk-capture'
async function context(){const [{env},{auth}]=await Promise.all([import('cloudflare:workers'),import('../../lib/auth')]);const session=await auth.api.getSession({headers:getRequestHeaders()});return {db:env.DB,actor:session?.user.id??null}}
export const previewBoardPacketFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const {db,actor}=await context();return previewBoardPacket(db,actor,data)})
export const saveBoardPacketFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const {db,actor}=await context();return saveBoardPacket(db,actor,data)})
export const listBoardPacketsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return listBoardPackets(db,actor)})
export const boardPacketOptionsFn=createServerFn({method:'GET'}).handler(async()=>{const {db,actor}=await context();return boardPacketOptions(db,actor)})
export const startBoardRiskCaptureFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const {db,actor}=await context();return startBoardRiskCapture(db,actor,data)})
export const advanceBoardRiskCaptureFn=createServerFn({method:'POST'}).validator((input:unknown)=>input).handler(async({data})=>{const {db,actor}=await context();return advanceBoardRiskCapture(db,actor,data)})
