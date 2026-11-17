import { spreadsheetCell as csvCell } from '../../lib/spreadsheet-cell.ts'
export type Polarity='debit-minus-credit'|'credit-minus-debit'
type Mapping={accountId:string;lineName:string;polarity:Polarity}
type Account={id:string;code:string;name:string;currency:string}
type Raw={accountId:string;code:string;name:string;currency:string;side:'debit'|'credit'|null;amountMinor:string|null}
export type WorksheetAccount={accountId:string;code:string;name:string;currency:string;debits:string;credits:string;lineName:string|null;polarity:Polarity|null;valueMinor:string|null}
export type WorksheetLine={lineName:string;currency:string;valueMinor:string}
const isAdmin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
function validDate(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid input');return v as Record<string,unknown>}
function csv(result:{mode:string;startDate:string|null;endDate:string;snapshotAt:string;accounts:WorksheetAccount[];lines:WorksheetLine[]}){
 const rows:string[][]=[['Statement working paper'],['Mode',result.mode],['Start date',result.startDate??''],['End date',result.endDate],['Snapshot time UTC',result.snapshotAt],['User-mapped working paper, not an approved financial statement. Posted entries filtered by effective date; the current account register and later backdated postings are included. Amounts are integer minor units.'],['Account ID','Code','Account name','Currency','Debits','Credits','User line','Polarity','Mapped value'],...result.accounts.map(a=>[a.accountId,a.code,a.name,a.currency,a.debits,a.credits,a.lineName??'',a.polarity??'',a.valueMinor??'']),['Line','Currency','Mapped value'],...result.lines.map(l=>[l.lineName,l.currency,l.valueMinor])]
 return '\ufeff'+rows.map((row,i)=>row.map((v,j)=>csvCell(v,(i>=7&&i<7+result.accounts.length&&[0,1,4,5,8].includes(j))||(i>=8+result.accounts.length&&j===2)||([2,3,4].includes(i)&&j===1))).join(',')).join('\r\n')+'\r\n'
}
export async function statementWorksheetOptions(db:D1Database,actorId:string|null):Promise<Account[]>{
 if(!actorId)throw new Error('Unauthorized')
 const [roles,accounts]=await db.batch([db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),db.prepare(`SELECT id,code,name,currency FROM ledger_accounts WHERE ${isAdmin} ORDER BY currency,code,id`).bind(actorId)])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 return accounts.results as Account[]
}
export async function statementWorksheet(db:D1Database,actorId:string|null,input:unknown){
 if(!actorId)throw new Error('Unauthorized')
 const v=record(input),mode=v.mode,startDate=v.startDate,endDate=v.endDate
 if((mode!=='position'&&mode!=='activity')||!validDate(endDate)||(mode==='activity'&&(!validDate(startDate)||startDate>endDate))||(mode==='position'&&startDate!==null))throw new Error('Invalid date or mode')
 if(!Array.isArray(v.mappings)||v.mappings.length>500)throw new Error('Invalid mappings')
 const mappings:Mapping[]=v.mappings.map((x:unknown)=>{const m=record(x);if(typeof m.accountId!=='string'||!m.accountId.trim()||m.accountId.length>128||typeof m.lineName!=='string'||!m.lineName.trim()||m.lineName.trim().length>200||(m.polarity!=='debit-minus-credit'&&m.polarity!=='credit-minus-debit'))throw new Error('Invalid mapping');return {accountId:m.accountId,lineName:m.lineName.trim(),polarity:m.polarity}})
 if(new Set(mappings.map(m=>m.accountId)).size!==mappings.length)throw new Error('Duplicate account mapping')
 const [roles,raw,clock]=await db.batch([
  db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),
  db.prepare(`SELECT a.id AS accountId,a.code,a.name,a.currency,p.side,CAST(p.amount_minor AS TEXT) AS amountMinor FROM ledger_accounts a LEFT JOIN (SELECT l.account_id,l.side,l.amount_minor FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted' AND e.effective_date<=? AND (? IS NULL OR e.effective_date>=?)) p ON p.account_id=a.id WHERE ${isAdmin} ORDER BY a.currency,a.code,a.id`).bind(endDate,mode==='activity'?startDate:null,mode==='activity'?startDate:null,actorId),
  db.prepare('SELECT CURRENT_TIMESTAMP AS snapshotAt'),
 ])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 const totals=new Map<string,{accountId:string;code:string;name:string;currency:string;debits:bigint;credits:bigint}>()
 for(const row of raw.results as Raw[]){let a=totals.get(row.accountId);if(!a){a={accountId:row.accountId,code:row.code,name:row.name,currency:row.currency,debits:0n,credits:0n};totals.set(row.accountId,a)}if(row.side==='debit')a.debits+=BigInt(row.amountMinor!);else if(row.side==='credit')a.credits+=BigInt(row.amountMinor!)}
 for(const m of mappings)if(!totals.has(m.accountId))throw new Error('Unknown account')
 const byId=new Map(mappings.map(m=>[m.accountId,m])),linesMap=new Map<string,{lineName:string;currency:string;value:bigint}>()
 const accounts:WorksheetAccount[]=[...totals.values()].map(a=>{const m=byId.get(a.accountId),value=m?(m.polarity==='debit-minus-credit'?a.debits-a.credits:a.credits-a.debits):null;if(m&&value!==null){const key=JSON.stringify([m.lineName,a.currency]);const line=linesMap.get(key)??{lineName:m.lineName,currency:a.currency,value:0n};line.value+=value;linesMap.set(key,line)}return {accountId:a.accountId,code:a.code,name:a.name,currency:a.currency,debits:String(a.debits),credits:String(a.credits),lineName:m?.lineName??null,polarity:m?.polarity??null,valueMinor:value===null?null:String(value)}})
 const lines:WorksheetLine[]=[...linesMap.values()].map(l=>({lineName:l.lineName,currency:l.currency,valueMinor:String(l.value)}))
 const result={mode,startDate:mode==='activity'?startDate as string:null,endDate,snapshotAt:(clock.results[0] as {snapshotAt:string}).snapshotAt,accounts,lines}
 return {...result,csv:csv(result)}
}
