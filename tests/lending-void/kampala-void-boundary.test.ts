import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'

const cases=[
 {trigger:'lending_void_reversal_effective',kind:'lending',source:'loan-repayment',voidSql:"INSERT INTO loan_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','repayment','source','error','v','u')"},
 {trigger:'investment_void_active_journal',kind:'investment',source:'investment-transaction',voidSql:"INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','source','error','v','u')"},
 {trigger:'investment_correction_void',kind:'investment-correction',source:'investment-transaction-correction',voidSql:"INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('v','transaction','source','error','v','u')"},
 {trigger:'cash_entry_void_active_journal',kind:'cash',source:'cash-entry',voidSql:"INSERT INTO cash_entry_voids(id,entry_id,reason,request_key,created_by) VALUES('v','source','error','v','u')"},
 {trigger:'cash_correction_void',kind:'cash-correction',source:'cash-entry-correction',voidSql:"INSERT INTO cash_entry_voids(id,entry_id,reason,request_key,created_by) VALUES('v','source','error','v','u')"},
] as const
function setup(c:typeof cases[number], instant:string, reversalDate:string|null, status='posted'){
 const db=new DatabaseSync(':memory:')
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${f}`,'utf8'))
 db.exec('PRAGMA foreign_keys=OFF')
 // Isolate the effectiveness trigger while retaining its real table schemas and SQL.
 const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all() as {name:string;sql:string}[]
 for(const trigger of triggers)db.exec(`DROP TRIGGER "${trigger.name}"`)
 const target=triggers.find(t=>t.name===c.trigger)!
 db.exec(target.sql.replaceAll("date('now'",`date('${instant}'`))
 db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,status) VALUES('j','UGX','2026-01-01','Original','${c.source}','source','u','${status}');`)
 if(c.kind==='investment-correction')db.exec("INSERT INTO investment_journal_corrections(id,transaction_id,journal_id,predecessor_reversal_id,created_by,request_key) VALUES('c','source','j','prior','u','key')")
 if(c.kind==='cash-correction')db.exec("INSERT INTO cash_journal_corrections(id,entry_id,journal_id,predecessor_reversal_id,created_by,request_key) VALUES('c','source','j','prior','u','key')")
 if(reversalDate)db.exec(`INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,status,reverses_entry_id) VALUES('r','UGX','${reversalDate}','Reversal','reversal','j','u','posted','j')`)
 return db
}
for(const c of cases)test(`${c.trigger} uses Kampala midnight and blocks ineffective reversals`,()=>{
 const before=setup(c,'2026-01-14 20:59:59','2026-01-15');assert.throws(()=>before.exec(c.voidSql));before.close()
 const after=setup(c,'2026-01-14 21:00:00','2026-01-15');assert.doesNotThrow(()=>after.exec(c.voidSql));after.close()
 const future=setup(c,'2026-01-14 21:00:00','2026-01-16');assert.throws(()=>future.exec(c.voidSql));future.close()
 const absent=setup(c,'2026-01-14 21:00:00',null);assert.throws(()=>absent.exec(c.voidSql));absent.close()
 if(c.kind!=='lending'){const draft=setup(c,'2026-01-14 21:00:00',null,'draft');assert.throws(()=>draft.exec(c.voidSql));draft.close()}
})
