import {test,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {createInvestmentRepository} from '../../src/server/investments/repository'
import {addInvestment,addValuation,addTransaction,listInvestments} from '../../src/server/investments/service'
function setup(onWrite:(db:DatabaseSync)=>void=()=>{}, onBatch:(db:DatabaseSync)=>void=()=>{}, onConfirm:(db:DatabaseSync)=>void=()=>{}) {
 const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+f,'utf8'))
 db.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@example.test',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','bootstrap'); INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bond','UGX','a');`)
 let done=false, confirmed=false; const stmt=(sql:string, args:unknown[]=[])=>({sql,args,bind(...a:unknown[]){return stmt(sql,a)},async first(){if(done&&!confirmed&&/request_key = \?/i.test(sql)){confirmed=true;onConfirm(db)}return db.prepare(sql).get(...args as never[])??null},async all(){return {results:db.prepare(sql).all(...args as never[])}},async run(){if(!done&&/^INSERT INTO investment/i.test(sql)){done=true;onWrite(db)}return db.prepare(sql).run(...args as never[])}})
 const adapter={prepare:(sql:string)=>stmt(sql),async batch(items:ReturnType<typeof stmt>[]){onBatch(db);return items.map(x=>({results:db.prepare(x.sql).all(...x.args as never[])}))}}
 return {db,repo:createInvestmentRepository(adapter as unknown as D1Database)}
}
const key='123e4567-e89b-42d3-a456-426614174000'
const cases=[
 {table:'investments',call:(r:ReturnType<typeof createInvestmentRepository>)=>addInvestment(r,'a',{name:'Test',assetClass:'Bond',currency:'UGX',requestKey:key})},
 {table:'investment_valuations',call:(r:ReturnType<typeof createInvestmentRepository>)=>addValuation(r,'a',{investmentId:'i',valuationDate:'2026-01-01',amountMinor:'10',basis:'Cost',requestKey:key})},
 {table:'investment_transactions',call:(r:ReturnType<typeof createInvestmentRepository>)=>addTransaction(r,'a',{investmentId:'i',transactionDate:'2026-01-01',amountMinor:'10',transactionType:'Interest',requestKey:key})},
]
for(const c of cases)test(`${c.table} rejects demotion before insertion`,async()=>{const {db,repo}=setup(db=>db.exec("DELETE FROM app_user_roles WHERE user_id='a'"));await expect(c.call(repo)).rejects.toThrow();expect(db.prepare(`SELECT count(*) n FROM ${c.table} WHERE request_key=?`).get(key)?.n).toBe(0);db.close()})
test('valuation rejects currency changed after selection',async()=>{const {db,repo}=setup(db=>db.exec("UPDATE investments SET currency='USD' WHERE id='i'"));await expect(cases[1].call(repo)).rejects.toThrow();expect(db.prepare('SELECT count(*) n FROM investment_valuations').get()?.n).toBe(0);db.close()})
test('list does not expose rows after demotion before snapshot',async()=>{const {db,repo}=setup(()=>{},db=>db.exec("DELETE FROM app_user_roles WHERE user_id='a'"));await expect(listInvestments(repo,'a')).rejects.toThrow();db.close()})

test('committed write does not reveal result after administrator demotion before confirmation',async()=>{const {db,repo}=setup(()=>{},()=>{},db=>db.exec("DELETE FROM app_user_roles WHERE user_id='a'"));await expect(cases[0].call(repo)).rejects.toThrow();expect(db.prepare('SELECT count(*) n FROM investments WHERE request_key=?').get(key)?.n).toBe(1);db.close()})
