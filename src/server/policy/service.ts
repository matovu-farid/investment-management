export type PolicyTarget = { id:string; assetClass:string; effectiveDate:string; minBasisPoints:number|null; maxBasisPoints:number|null; targetBasisPoints:number|null; source:string; notes:string|null; createdBy:string }
export interface PolicyRepository { roleFor(userId:string):Promise<string|null>; list():Promise<PolicyTarget[]>; create(value:PolicyTarget,key:string):Promise<PolicyTarget> }
async function requireAdmin(repo:PolicyRepository, actorId:string|null):Promise<string> { if (!actorId || await repo.roleFor(actorId)!=='admin') throw new Error('Unauthorized'); return actorId }
function text(value:unknown,max:number):string { if(typeof value!=='string'|| !value.trim() || value.trim().length>max) throw new Error('Invalid input'); return value.trim() }
function bp(value:unknown):number { if(typeof value!=='string'|| !/^\d+$/.test(value) || Number(value)>10000) throw new Error('Invalid allocation'); return Number(value) }
export async function listPolicyTargets(repo:PolicyRepository,actorId:string|null) { await requireAdmin(repo,actorId); return repo.list() }
export async function addPolicyTarget(repo:PolicyRepository,actorId:string|null,input:unknown) {
 const createdBy=await requireAdmin(repo,actorId)
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid input')
 const v=input as Record<string,unknown>; const effectiveDate=text(v.effectiveDate,10)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(Date.parse(`${effectiveDate}T00:00:00Z`)) || new Date(`${effectiveDate}T00:00:00Z`).toISOString().slice(0,10)!==effectiveDate) throw new Error('Invalid date')
 const minBasisPoints=bp(v.minBasisPoints),maxBasisPoints=bp(v.maxBasisPoints),targetBasisPoints=v.targetBasisPoints==='' || v.targetBasisPoints==null ? null : bp(v.targetBasisPoints)
 if(minBasisPoints>maxBasisPoints || (targetBasisPoints!==null && (targetBasisPoints<minBasisPoints || targetBasisPoints>maxBasisPoints))) throw new Error('Invalid allocation range')
 const key=text(v.requestKey,36).toLowerCase(); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) throw new Error('Invalid request key')
 return repo.create({id:crypto.randomUUID(),assetClass:text(v.assetClass,100),effectiveDate,minBasisPoints,maxBasisPoints,targetBasisPoints,source:text(v.source,500),notes:v.notes==null||v.notes===''?null:text(v.notes,2000),createdBy},key)
}
