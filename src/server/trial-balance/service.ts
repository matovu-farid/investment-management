type Line={accountId:string;code:string;name:string;currency:string;side:'debit'|'credit'|null;amountMinor:string|null}
type Balance={accountId:string;code:string;name:string;currency:string;debits:string;credits:string;netDebit:string;netCredit:string}
export async function trialBalance(db:D1Database,actorId:string|null,asOf:unknown){
 if(!actorId)throw new Error('Unauthorized')
 if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)throw new Error('Invalid date')
 const [roles,lines]=await db.batch([
  db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),
  db.prepare(`SELECT a.id AS accountId,a.code,a.name,a.currency,p.side,CAST(p.amount_minor AS TEXT) AS amountMinor FROM ledger_accounts a LEFT JOIN (SELECT l.account_id,l.side,l.amount_minor FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted' AND e.effective_date<=?) p ON p.account_id=a.id WHERE EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY a.currency,a.code,a.id`).bind(asOf,actorId),
 ])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 const byAccount=new Map<string,{accountId:string;code:string;name:string;currency:string;debits:bigint;credits:bigint}>()
 for(const row of lines.results as Line[]){let b=byAccount.get(row.accountId);if(!b){b={accountId:row.accountId,code:row.code,name:row.name,currency:row.currency,debits:0n,credits:0n};byAccount.set(row.accountId,b)}if(row.side==='debit')b.debits+=BigInt(row.amountMinor!);if(row.side==='credit')b.credits+=BigInt(row.amountMinor!)}
 const totalsMap=new Map<string,{debits:bigint;credits:bigint;netDebit:bigint;netCredit:bigint}>()
 const accounts:Balance[]=[...byAccount.values()].map(b=>{const net=b.debits-b.credits;const debit=net>0n?net:0n,credit=net<0n?-net:0n;const t=totalsMap.get(b.currency)??{debits:0n,credits:0n,netDebit:0n,netCredit:0n};t.debits+=b.debits;t.credits+=b.credits;t.netDebit+=debit;t.netCredit+=credit;totalsMap.set(b.currency,t);return {accountId:b.accountId,code:b.code,name:b.name,currency:b.currency,debits:String(b.debits),credits:String(b.credits),netDebit:String(debit),netCredit:String(credit)}})
 const totals=[...totalsMap].map(([currency,t])=>({currency,debits:String(t.debits),credits:String(t.credits),netDebit:String(t.netDebit),netCredit:String(t.netCredit)}))
 return {asOf,accounts,totals}
}
