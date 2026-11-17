import { formatJournalDescription } from '../../lib/journal-description.ts'
import { spreadsheetCell as quote } from '../../lib/spreadsheet-cell.ts'
export type Account = {id:string;code:string;name:string;currency:string}
export type ActivityLine = {id:string;entryId:string;effectiveDate:string;description:string;sourceType:string;sourceId:string;reversesEntryId:string|null;reversedById:string|null;side:'debit'|'credit';amountMinor:string}
export type Amounts = {debits:string;credits:string;netDebit:string;netCredit:string}
type Entry = ActivityLine & {createdAt:string}
type Activity = {account:Account;startDate:string;endDate:string;snapshotAt:string;opening:Amounts;period:Amounts;closing:Amounts;lines:ActivityLine[]}
const adminExists = "EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
function date(v:unknown):v is string {return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}
function amounts(debits:bigint,credits:bigint):Amounts {const net=debits-credits;return {debits:String(debits),credits:String(credits),netDebit:String(net>0n?net:0n),netCredit:String(net<0n?-net:0n)}}
function makeCsv(a:Activity){
 const rows:string[][]=[['Account activity statement'],['Account code',a.account.code],['Account name',a.account.name],['Currency',a.account.currency],['Start date',a.startDate],['End date',a.endDate],['Snapshot time (UTC)',a.snapshotAt],['Posted entries only. Backdated entries posted later may change this statement. Amounts are integer minor units; import columns as text.'],['Section','Debits','Credits','Net debit','Net credit'],...(['opening','period','closing'] as const).map(k=>[k,a[k].debits,a[k].credits,a[k].netDebit,a[k].netCredit]),['Date','Entry ID','Line ID','Description','Source type','Source ID','Reverses entry ID','Reversed by entry ID through end date','Side','Amount minor units'],...a.lines.map(l=>[l.effectiveDate,l.entryId,l.id,formatJournalDescription(l.sourceType,l.description),l.sourceType,l.sourceId,l.reversesEntryId??'',l.reversedById??'',l.side,l.amountMinor])]
 return '\ufeff'+rows.map((r,i)=>r.map((v,j)=>quote(v,([1,4,5,6].includes(i)&&j===1)||(i>=9&&i<=11&&j>0)||(i>=13&&[0,1,2,5,6,7,9].includes(j)))).join(',')).join('\r\n')+'\r\n'
}
export async function accountActivityOptions(db:D1Database,actorId:string|null):Promise<Account[]> {
 if(!actorId)throw new Error('Unauthorized')
 const [roles,accounts]=await db.batch([db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),db.prepare(`SELECT id,code,name,currency FROM ledger_accounts WHERE ${adminExists} ORDER BY code,id`).bind(actorId)])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 return accounts.results as Account[]
}
export async function accountActivity(db:D1Database,actorId:string|null,input:unknown):Promise<Activity & {csv:string}> {
 if(!actorId)throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid statement input')
 const {accountId,startDate,endDate}=input as Record<string,unknown>
 if(typeof accountId!=='string'||!accountId.trim()||accountId.length>128)throw new Error('Invalid account')
 if(!date(startDate)||!date(endDate)||startDate>endDate)throw new Error('Invalid date range')
 const [roles,accounts,entries,clock]=await db.batch([
  db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),
  db.prepare(`SELECT id,code,name,currency FROM ledger_accounts WHERE id=? AND ${adminExists}`).bind(accountId,actorId),
  db.prepare(`SELECT l.id,e.id AS entryId,e.effective_date AS effectiveDate,e.created_at AS createdAt,e.description,e.source_type AS sourceType,e.source_id AS sourceId,e.reverses_entry_id AS reversesEntryId,(SELECT r.id FROM journal_entries r WHERE r.reverses_entry_id=e.id AND r.status='posted' AND r.effective_date<=?) AS reversedById,l.side,CAST(l.amount_minor AS TEXT) AS amountMinor FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=? AND e.status='posted' AND e.effective_date<=? AND ${adminExists} ORDER BY e.effective_date,e.created_at,e.id,l.id`).bind(endDate,accountId,endDate,actorId),
  db.prepare('SELECT CURRENT_TIMESTAMP AS snapshotAt'),
 ])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 const account=accounts.results[0] as Account|undefined;if(!account)throw new Error('Account not found')
 let od=0n,oc=0n,pd=0n,pc=0n;const lines:ActivityLine[]=[]
 for(const row of entries.results as Entry[]){const v=BigInt(row.amountMinor);if(row.effectiveDate<startDate){if(row.side==='debit')od+=v;else oc+=v}else{if(row.side==='debit')pd+=v;else pc+=v;const {createdAt:_,...line}=row;lines.push(line)}}
 const result:Activity={account,startDate,endDate,snapshotAt:(clock.results[0] as {snapshotAt:string}).snapshotAt,opening:amounts(od,oc),period:amounts(pd,pc),closing:amounts(od+pd,oc+pc),lines}
 return {...result,csv:makeCsv(result)}
}
