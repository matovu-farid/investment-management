import {captureSales,saleRequestOptions,type SaleData} from './sales.ts'
import { createReportRepository } from '../reports/repository.ts'
import { reportForPeriod } from '../reports/service.ts'
import { lendingSnapshot } from '../lending-snapshot/service.ts'
import { trialBalance } from '../trial-balance/service.ts'
import { getAllocationData } from '../allocation/service.ts'
import { calculateAllocation } from '../allocation/calculate.ts'
import { createBudgetRepository } from '../budgets/repository.ts'
import { listBudgetData } from '../budgets/service.ts'
import { calculateBudgetComparison } from '../budgets/calculate.ts'
import { statementWorksheet, statementWorksheetOptions, type Polarity } from '../statement-worksheet/service.ts'

type Capture<T>={capturedFrom:string;capturedTo:string;data:T}
type Activity=Awaited<ReturnType<typeof reportForPeriod>>
type Lending=Awaited<ReturnType<typeof lendingSnapshot>>
type Trial=Awaited<ReturnType<typeof trialBalance>>
type AllocationSelection={currency:string;asOf:string;selected:Record<string,string>;mappings:Record<string,string>}
type ComparisonBasis='investment'|'cash_receipts'|'cash_payments'
type BudgetSelection={budgetId:string;transactionIds:string[];cashEntryIds?:string[];comparisonBasis?:ComparisonBasis}
type BudgetComparison=Omit<ReturnType<typeof calculateBudgetComparison>,'comparisonBasis'> & {snapshotAt:string;comparisonBasis?:ComparisonBasis}
type StatementSelection={mode:'position'|'activity';startDate:string|null;endDate:string;mappings:{accountId:string;lineName:string;polarity:Polarity}[]}
type Statement=Capture<Awaited<ReturnType<typeof statementWorksheet>>> & {selection:StatementSelection}
export type Packet={start:string;end:string;activity:Capture<Activity>;lending:Capture<Lending>;trialBalance:Capture<Trial>;allocation?:Capture<ReturnType<typeof calculateAllocation>> & {selection:AllocationSelection};budgets?:Capture<BudgetComparison[]> & {selection:BudgetSelection[]};statements?:Statement[];sales?:Capture<SaleData>;omissions:string[]}
const allocationOmission='Allocation and investment policy comparison are omitted; explicit valuation and policy selections are required.'
const budgetOmission='Budget comparison is omitted; explicit budget and transaction selections are required.'
const salesOmission='Share-sale requests are omitted; explicit request selections are required.'
const statementOmission='Statement working papers are omitted; explicit account mappings are required.'
async function admin(db:D1Database,id:string|null){if(!id||(await db.prepare("SELECT role FROM app_user_roles WHERE user_id=?").bind(id).first<{role:string}>())?.role!=='admin')throw new Error('Unauthorized');return id}
function validDate(x:unknown):x is string{return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x}
function obj(x:unknown):Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Invalid request');return x as Record<string,unknown>}
function key(x:unknown){if(typeof x!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x))throw new Error('Invalid request key');return x.toLowerCase()}
async function clock(db:D1Database){const r=await db.prepare('SELECT CURRENT_TIMESTAMP AS now').first<{now:string}>();if(!r)throw new Error('Clock unavailable');return r.now}
async function capture<T>(db:D1Database,fetch:()=>Promise<T>):Promise<Capture<T>>{const capturedFrom=await clock(db);const data=await fetch();const capturedTo=await clock(db);return {capturedFrom,capturedTo,data}}
function id(x:unknown):string{if(typeof x!=='string'||!x.trim()||x.length>128||x!==x.trim())throw new Error('Invalid selection');return x}
function entries(x:unknown):Record<string,string>{const o=obj(x);const list=Object.entries(o);if(list.length>100)throw new Error('Too many selections');const out:Record<string,string>=Object.create(null);for(const [k,v] of list){id(k);if(typeof v!=='string'||v.length>128||v!==v.trim())throw new Error('Invalid selection');if(v)out[k]=id(v)}return out}
function allocationSelection(x:unknown):AllocationSelection|undefined{if(x==null)return undefined;const v=obj(x);if(typeof v.currency!=='string'||! /^[A-Z]{3}$/.test(v.currency)||!validDate(v.asOf))throw new Error('Invalid allocation');const selected=entries(v.selected),mappings=entries(v.mappings);if(!Object.keys(selected).length)throw new Error('Select observations');return {currency:v.currency,asOf:v.asOf,selected,mappings}}
function budgetSelections(x:unknown):BudgetSelection[]|undefined{
 if(x==null)return undefined
 if(!Array.isArray(x)||x.length<1||x.length>100)throw new Error('Invalid budgets')
 const choices=x.map((v):BudgetSelection=>{
  const o=obj(v),budgetId=id(o.budgetId)
  if(!Array.isArray(o.transactionIds)||o.transactionIds.length>100)throw new Error('Invalid transactions')
  const transactionIds=o.transactionIds.map(id)
  if(new Set(transactionIds).size!==transactionIds.length)throw new Error('Duplicate transactions')
  if(o.comparisonBasis!==undefined&&o.comparisonBasis!=='investment'&&o.comparisonBasis!=='cash_receipts'&&o.comparisonBasis!=='cash_payments')throw new Error('Invalid comparison basis')
  const comparisonBasis=o.comparisonBasis as ComparisonBasis|undefined
  if(comparisonBasis&&comparisonBasis!=='investment'&&o.cashEntryIds===undefined)throw new Error('Select cash records for cash comparison')
  if(o.cashEntryIds===undefined)return {budgetId,transactionIds,...(comparisonBasis===undefined?{}:{comparisonBasis})}
  if(!Array.isArray(o.cashEntryIds)||o.cashEntryIds.length>100)throw new Error('Invalid cash records')
  const cashEntryIds=o.cashEntryIds.map(id)
  if(new Set(cashEntryIds).size!==cashEntryIds.length)throw new Error('Duplicate cash records')
  return {budgetId,transactionIds,cashEntryIds,...(comparisonBasis===undefined?{}:{comparisonBasis})}
 })
 if(new Set(choices.map(c=>c.budgetId)).size!==choices.length)throw new Error('Duplicate budgets')
 return choices
}
function statementSelections(x:unknown):StatementSelection[]|undefined{if(x==null)return undefined;if(!Array.isArray(x)||x.length<1||x.length>10)throw new Error('Invalid statements');return x.map(v=>{const o=obj(v);if((o.mode!=='position'&&o.mode!=='activity')||!validDate(o.endDate)||(o.mode==='position'&&o.startDate!==null)||(o.mode==='activity'&&(!validDate(o.startDate)||o.startDate>o.endDate))||!Array.isArray(o.mappings)||o.mappings.length<1||o.mappings.length>500)throw new Error('Invalid statement');const mappings=o.mappings.map(v=>{const m=obj(v),accountId=id(m.accountId);if(typeof m.lineName!=='string'||!m.lineName.trim()||m.lineName.trim().length>200||(m.polarity!=='debit-minus-credit'&&m.polarity!=='credit-minus-debit'))throw new Error('Invalid mapping');return {accountId,lineName:m.lineName.trim(),polarity:m.polarity as Polarity}});if(new Set(mappings.map(m=>m.accountId)).size!==mappings.length)throw new Error('Duplicate account mapping');return {mode:o.mode,startDate:o.startDate as string|null,endDate:o.endDate,mappings}})}
export async function boardPacketOptions(db:D1Database,actorId:string|null){const actor=await admin(db,actorId);const [allocation,budgets,statementAccounts,saleRequests]=await Promise.all([getAllocationData(db,actor),listBudgetData(createBudgetRepository(db),actor),statementWorksheetOptions(db,actor),saleRequestOptions(db,actor)]);await admin(db,actor);return {allocation,budgets,statementAccounts,saleRequests}}
async function generate(db:D1Database,actor:string,start:string,end:string,allocationSelectionValue?:AllocationSelection,budgetSelectionValues?:BudgetSelection[],statementSelectionValues?:StatementSelection[],saleIds?:string[]):Promise<Packet>{
 const activity=await capture(db,()=>reportForPeriod(createReportRepository(db),actor,{start,end}))
 const lending=await capture(db,()=>lendingSnapshot(db,actor,{asOf:end}))
 const trial=await capture(db,()=>trialBalance(db,actor,end))
 let allocation:Packet['allocation'],budgets:Packet['budgets']
 if(allocationSelectionValue){const s=allocationSelectionValue;const captured=await capture(db,async()=>{const data=await getAllocationData(db,actor);const selectedClasses=new Set(Object.keys(s.selected).map(i=>data.investments.find(v=>v.id===i)?.assetClass));if(Object.keys(s.mappings).some(c=>!selectedClasses.has(c)))throw new Error('Policy mapping has no selected class');return calculateAllocation(data,s.currency,s.asOf,s.selected,s.mappings)});allocation={...captured,selection:s}}
 if(budgetSelectionValues){const captured=await capture(db,async()=>{const data=await listBudgetData(createBudgetRepository(db),actor);return budgetSelectionValues.map(s=>{const budget=data.budgets.find(b=>b.id===s.budgetId);if(!budget||budget.voidedAt)throw new Error('Budget unavailable');return {...calculateBudgetComparison(budget,data.transactions,s.transactionIds,data.cashEntries,s.cashEntryIds,s.comparisonBasis),snapshotAt:data.snapshotAt}})});budgets={...captured,selection:budgetSelectionValues}}
 const statements:Statement[]=[]
 if(statementSelectionValues)for(const selection of statementSelectionValues){const captured=await capture(db,()=>statementWorksheet(db,actor,selection));statements.push({...captured,selection})}
 const sales=saleIds?await capture(db,()=>captureSales(db,actor,saleIds,end)):undefined
 await admin(db,actor)
 return {start,end,activity,lending,trialBalance:trial,...(allocation?{allocation}:{}),...(budgets?{budgets}:{}),...(statements.length?{statements}:{}),...(sales?{sales}:{}),omissions:[...(!allocation?[allocationOmission]:[]),...(!budgets?[budgetOmission]:[]),...(!statements.length?[statementOmission]:[]),...(!sales?[salesOmission]:[])]}
}
function saleSelections(x:unknown):string[]|undefined{if(x==null)return undefined;if(!Array.isArray(x)||x.length<1||x.length>100)throw new Error('Select 1 to 100 sale requests');const ids=x.map(id);if(new Set(ids).size!==ids.length)throw new Error('Duplicate sale request');return ids}
/** Previews are server-generated and stored to preserve exactly what was reviewed. */
export async function previewBoardPacket(db:D1Database,actorId:string|null,input:unknown){const actor=await admin(db,actorId),v=obj(input);if(!validDate(v.start)||!validDate(v.end)||v.start>v.end)throw new Error('Invalid period');const packet=await generate(db,actor,v.start,v.end,allocationSelection(v.allocation),budgetSelections(v.budgets),statementSelections(v.statements),saleSelections(v.saleRequestIds)),json=JSON.stringify(packet);if(json.length>2000000)throw new Error('Packet exceeds size limit');const previewId=crypto.randomUUID();await db.batch([db.prepare("DELETE FROM board_packet_previews WHERE created_at<datetime('now','-1 day') AND NOT EXISTS(SELECT 1 FROM board_packets WHERE preview_id=board_packet_previews.id) AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor),db.prepare('INSERT INTO board_packet_previews(id,created_by,packet) VALUES(?,?,?)').bind(previewId,actor,json)]);return {previewId,...packet}}
export async function saveBoardPacket(db:D1Database,actorId:string|null,input:unknown){const actor=await admin(db,actorId),v=obj(input),k=key(v.requestKey);if(typeof v.previewId!=='string'||!v.previewId.trim()||v.previewId.length>128)throw new Error('Invalid preview');const previewId=v.previewId;const find=()=>db.prepare('SELECT id,preview_id AS previewId,created_by AS createdBy FROM board_packets WHERE request_key=?').bind(k).first<{id:string;previewId:string;createdBy:string}>();let saved=await find();if(saved){if(saved.previewId!==previewId||saved.createdBy!==actor)throw new Error('Request key already used');return{id:saved.id}}
 const preview=await db.prepare("SELECT id FROM board_packet_previews WHERE id=? AND created_by=? AND created_at>=datetime('now','-1 day') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(previewId,actor,actor).first<{id:string}>();if(!preview)throw new Error('Preview unavailable or expired');
 try{await db.prepare('INSERT INTO board_packets(id,preview_id,request_key,created_by) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM board_packets WHERE request_key=?)').bind(crypto.randomUUID(),previewId,k,actor,k).run()}catch(e){saved=await find();if(!saved)throw e}saved=await find();if(!saved||saved.previewId!==previewId||saved.createdBy!==actor)throw new Error('Request key already used');return{id:saved.id}}
export async function listBoardPackets(db:D1Database,actorId:string|null){const actor=await admin(db,actorId);const rows=(await db.prepare("SELECT p.id,p.created_at AS createdAt,p.created_by AS createdBy,v.packet FROM board_packets p JOIN board_packet_previews v ON v.id=p.preview_id WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY p.created_at DESC,p.rowid DESC").bind(actor).all<{id:string;createdAt:string;createdBy:string;packet:string}>()).results;return rows.map(r=>({...r,packet:JSON.parse(r.packet) as Packet}))}
