import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {DatabaseSync} from 'node:sqlite'
import {readdirSync,readFileSync} from 'node:fs'
function setup(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));sql.exec(`INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES('a','Admin','a@a',1,1),('u','User','u@a',1,1); INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('a','admin','a'); INSERT INTO members(id,member_number,full_name,created_by) VALUES('m','001','Member','a');`);const stmt=(q:string,args:unknown[]=[])=>({bind(...p:unknown[]){return stmt(q,p)},async first(){return sql.prepare(q).get(...args as never[])??null},async all(){return {results:sql.prepare(q).all(...args as never[])}},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args as never[]).changes)}}}});return {sql,db:{prepare:(q:string)=>stmt(q),async batch(s:{all:()=>Promise<unknown>}[]){return Promise.all(s.map(x=>x.all()))}} as unknown as D1Database}}

test('cash activity in a reviewed board packet stays frozen after a void and later entry',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) VALUES('cash-1','2020-06-01','payment','90071992547409930','UGX','Supplier','=invoice','Original expense','cash-key-1','a')`)
 const s=await import('../../src/server/board-packets/service.ts')
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'})
 assert.equal(p.activity.data.cashEntries?.length,1)
 assert.equal(p.activity.data.cashEntries?.[0].amountMinor,'90071992547409930')
 assert.equal(p.activity.data.cashEntries?.[0].voidedAt,null)
 sql.exec(`INSERT INTO cash_entry_voids(id,entry_id,reason,request_key,created_by) VALUES('void-1','cash-1','correction','void-key-1','a'); INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) VALUES('cash-2','2020-07-01','receipt','500','UGX','','','Later receipt','cash-key-2','a')`)
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 const frozen=(await s.listBoardPackets(db,'a'))[0].packet.activity.data.cashEntries!
 assert.equal(frozen.length,1); assert.equal(frozen[0].id,'cash-1'); assert.equal(frozen[0].voidedAt,null)
 const fresh=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'})
 assert.equal(fresh.activity.data.cashEntries?.length,2)
 assert.equal(fresh.activity.data.cashEntries?.find(x=>x.id==='cash-1')?.voidReason,'correction')
 sql.close()
})
const key='fa5c5220-5ec2-4f62-97d0-5b72ccff4f5b'
test('completed server risk capture is copied into the reviewed board packet',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts'),risk=await import('../../src/server/board-packets/risk-capture.ts')
 const capture=await risk.startBoardRiskCapture(db,'a',{currency:'UGX',asOfDate:'2020-12-31'})
 assert.equal(capture.profile.nextOffset,null)
 await assert.rejects(s.previewBoardPacket(db,'b',{start:'2020-01-01',end:'2020-12-31',riskCaptureId:capture.id}))
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-30',riskCaptureId:capture.id}),/date/i)
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',riskCaptureId:capture.id})
 assert.equal(p.creditRisk?.currency,'UGX');assert.ok(!p.omissions.some(x=>x.includes('credit-risk profile')))
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});sql.prepare('DELETE FROM board_risk_captures WHERE id=?').run(capture.id)
 const frozen=(await s.listBoardPackets(db,'a'))[0].packet;assert.equal(frozen.creditRisk?.currency,'UGX')
 const {boardPacketCsv}=await import('../../src/lib/board-packet-export.ts');assert.match(boardPacketCsv(frozen),/Credit-book risk profile/i)
 sql.close()
})
test('multi-page risk capture freezes coverage and unavailable loans in a packet',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts'),risk=await import('../../src/server/board-packets/risk-capture.ts')
 for(let i=0;i<6;i++)sql.prepare("INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES(?,'m',100,'UGX','2020-01-01','terms','a')").run(`loan-${i}`)
 const first=await risk.startBoardRiskCapture(db,'a',{currency:'UGX',asOfDate:'2020-12-31'})
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',riskCaptureId:first.id}),/incomplete/i)
 const completed=await risk.advanceBoardRiskCapture(db,'a',{id:first.id,expectedOffset:5});assert.equal(completed.profile.unavailableLoanIds.length,6)
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',riskCaptureId:first.id,includeCalculatedLending:true});assert.equal(p.creditRisk?.totalEligible,6);assert.equal(p.creditRisk?.unavailableLoanIds.length,6)
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});const saved=(await s.listBoardPackets(db,'a'))[0].packet
 const {boardPacketCsv}=await import('../../src/lib/board-packet-export.ts');const csv=boardPacketCsv(saved);assert.match(csv,/Balance unavailable/);assert.match(csv,/loan-5/)
 const {boardPacketSummary}=await import('../../src/lib/board-packet-summary.ts');assert.doesNotMatch(JSON.stringify(boardPacketSummary(saved)),/loan-5|creditRisk/)
 sql.close()
})
test('unlinked member balance observations are frozen in board-pack lending data and CSV',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('loan','m',1000,'UGX','2020-01-01','terms','a');
 INSERT INTO reported_loan_balances(id,loan_id,member_id,currency,disbursement_date,principal_minor,observed_date,amount_minor,basis,source,request_key,created_by) VALUES('obs','loan','m','UGX','2020-01-01','1000','2020-06-01','900','reported','GM sheet','00000000-0000-4000-8000-000000000011','a');`)
 const s=await import('../../src/server/board-packets/service.ts')
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'})
 assert.equal(p.lending.data.loans[0].observations?.[0].amountMinor,'900')
 assert.match(p.lending.data.csv,/GM sheet/)
 sql.exec(`INSERT INTO reported_loan_balance_voids(id,observation_id,reason,request_key,created_by) VALUES('void','obs','later correction','00000000-0000-4000-8000-000000000012','a')`)
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 const saved=(await s.listBoardPackets(db,'a'))[0].packet
 assert.equal(saved.lending.data.loans[0].observations?.[0].voidedAt,null)
 assert.doesNotMatch(saved.lending.data.csv,/later correction/)
 sql.close()
})
test('frozen reviewed packet is admin-only, retryable and preserves components',async()=>{const {sql,db}=setup();const s=await import('../../src/server/board-packets/service.ts');await assert.rejects(s.previewBoardPacket(db,'u',{start:'2020-01-01',end:'2020-12-31'}));const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'});assert.equal(p.activity.data.members.length,1);assert.equal(p.omissions.length,6);assert.ok(p.omissions.some(x=>x.includes('credit-risk profile')));const out=await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});assert.deepEqual(await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key}),out);sql.exec("UPDATE members SET full_name='Later' WHERE id='m'");const rows=await s.listBoardPackets(db,'a');assert.equal(rows[0].packet.activity.data.members[0].name,'Member');assert.ok(rows[0].packet.omissions.some(x=>x.includes('credit-risk profile')));await assert.rejects(s.listBoardPackets(db,'u'));sql.close()})
test('changes after preview do not alter the reviewed frozen packet',async()=>{const {sql,db}=setup();const s=await import('../../src/server/board-packets/service.ts');const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'});sql.exec("UPDATE members SET full_name='Changed' WHERE id='m'");await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});assert.equal((await s.listBoardPackets(db,'a'))[0].packet.activity.data.members[0].name,'Member');sql.close()})
test('corrected policy affects new allocation reviews while saved board drafts retain the reviewed range',async()=>{
 const {sql,db}=setup();sql.exec(`INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bonds','UGX','a');INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES('v','i','2020-06-01',100,'UGX','cost','a');INSERT INTO policy_targets(id,asset_class,min_basis_points,max_basis_points,effective_date,source,created_by) VALUES('p','Bonds',1000,2500,'2020-01-01','Original','a')`)
 const packets=await import('../../src/server/board-packets/service.ts'),{correctPolicyTarget}=await import('../../src/server/policy/corrections.ts')
 const selection={currency:'UGX',asOf:'2020-12-31',selected:{i:'v'},mappings:{Bonds:'p'}}
 const preview=await packets.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:selection});assert.equal(preview.allocation?.data.policyGroups[0].policy.maxBasisPoints,2500)
 await correctPolicyTarget(db,'a',{policyId:'p',expectedCorrectionId:null,expectedMinBasisPoints:1000,expectedMaxBasisPoints:2500,expectedTargetBasisPoints:null,expectedSource:'Original',expectedNotes:null,minBasisPoints:0,maxBasisPoints:10000,targetBasisPoints:null,source:'Corrected',notes:null,reason:'Test correction',requestKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
 await packets.saveBoardPacket(db,'a',{previewId:preview.previewId,requestKey:key});const saved=(await packets.listBoardPackets(db,'a'))[0].packet
 assert.equal(saved.allocation?.data.policyGroups[0].policy.maxBasisPoints,2500)
 const updated=await packets.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:selection});assert.equal(updated.allocation?.data.policyGroups[0].policy.maxBasisPoints,10000)
 sql.close()
})
test('unsaved previews expire and are cleaned up, saved packets remain immutable',async()=>{const {sql,db}=setup();const s=await import('../../src/server/board-packets/service.ts');const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'});await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});sql.exec(`INSERT INTO board_packet_previews(id,created_by,packet,created_at) SELECT 'expired','a',packet,'2000-01-01 00:00:00' FROM board_packet_previews WHERE id='${p.previewId}'`);await assert.rejects(s.saveBoardPacket(db,'a',{previewId:'expired',requestKey:'ea5c5220-5ec2-4f62-97d0-5b72ccff4f5b'}));await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'});assert.equal(sql.prepare("SELECT count(*) AS n FROM board_packet_previews WHERE id='expired'").get()!.n,0);assert.throws(()=>sql.exec(`DELETE FROM board_packet_previews WHERE id='${p.previewId}'`));assert.equal((await s.listBoardPackets(db,'a')).length,1);sql.close()})
test('preview is owner-bound and a request key cannot be repurposed',async()=>{const {sql,db}=setup();sql.exec(`INSERT INTO app_user_roles(user_id,role,granted_by) VALUES('u','admin','a')`);const s=await import('../../src/server/board-packets/service.ts');const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'});await assert.rejects(s.saveBoardPacket(db,'u',{previewId:p.previewId,requestKey:key}));const q=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'});await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});await assert.rejects(s.saveBoardPacket(db,'a',{previewId:q.previewId,requestKey:key}));assert.equal((await s.listBoardPackets(db,'a')).length,1);sql.close()})
test('explicit allocation and budget choices are captured and frozen',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bonds','UGX','a');
 INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES('v','i','2020-06-01',9007199254740991,'UGX','cost','a');
 INSERT INTO investment_transactions(id,investment_id,transaction_date,transaction_type,amount_minor,created_by) VALUES('t','i','2020-07-01','income',100,'a');
 INSERT INTO policy_targets(id,asset_class,min_basis_points,max_basis_points,effective_date,created_by) VALUES('p','Bonds',1000,10000,'2020-01-01','a');
 INSERT INTO budget_lines(id,category,period_start,period_end,currency,amount_minor,source,created_by,request_key) VALUES('b','Income','2020-01-01','2020-12-31','UGX',200,'budget','a','bkey');`)
 const s=await import('../../src/server/board-packets/service.ts')
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:{currency:'UGX',asOf:'2020-12-31',selected:{i:'v'},mappings:{Bonds:'p'}},budgets:[{budgetId:'b',transactionIds:['t']}]})
 assert.equal(p.allocation?.data.total,'9007199254740991');assert.equal(p.budgets?.data[0].difference,'-100');assert.deepEqual(p.budgets?.selection,[{budgetId:'b',transactionIds:['t']}]);assert.equal(p.omissions.length,4)
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});sql.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('x','valuation','v','error','xkey','a')")
 assert.equal((await s.listBoardPackets(db,'a'))[0].packet.allocation?.data.total,'9007199254740991')
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:{currency:'UGX',asOf:'2020-12-31',selected:{i:'v'},mappings:{}}}))
 sql.close()
})
test('board packet preserves combined policy groups after its underlying valuation changes',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i1','Fund','Money market','UGX','a'),('i2','Deposit','Fixed deposit','UGX','a');
 INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES('v1','i1','2020-06-01',40,'UGX','cost','a'),('v2','i2','2020-06-01',60,'UGX','cost','a');
 INSERT INTO policy_targets(id,asset_class,min_basis_points,max_basis_points,effective_date,created_by) VALUES('p','Short-term',9000,10000,'2020-01-01','a');`)
 const s=await import('../../src/server/board-packets/service.ts')
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:{currency:'UGX',asOf:'2020-12-31',selected:{i1:'v1',i2:'v2'},mappings:{'Money market':'p','Fixed deposit':'p'}}})
 assert.equal(p.allocation?.data.policyGroups[0].amountMinor,'100')
 assert.equal(p.allocation?.data.policyGroups[0].comparison,'within')
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 sql.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('x','valuation','v1','error','xkey','a')")
 const group=(await s.listBoardPackets(db,'a'))[0].packet.allocation?.data.policyGroups[0]
 assert.equal(group?.amountMinor,'100');assert.equal(group?.comparison,'within');assert.deepEqual(new Set(group?.assetClasses),new Set(['Money market','Fixed deposit']))
 sql.close()
})
test('board packet captures explicit zero policy comparisons and rejects duplicates',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bonds','UGX','a');
 INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES('v','i','2020-06-01',100,'UGX','cost','a');
 INSERT INTO policy_targets(id,asset_class,min_basis_points,max_basis_points,effective_date,created_by) VALUES('p','Equities',2500,4500,'2020-01-01','a');`)
 const s=await import('../../src/server/board-packets/service.ts')
 const base={currency:'UGX',asOf:'2020-12-31',selected:{i:'v'},mappings:{},zeroPolicyIds:['p']}
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:base})
 assert.equal(p.allocation?.data.policyGroups[0].comparison,'below');assert.equal(p.allocation?.data.policyGroups[0].explicitZero,true)
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 const frozen=(await s.listBoardPackets(db,'a'))[0].packet.allocation!
 assert.deepEqual(frozen.selection.zeroPolicyIds,['p']);assert.equal(frozen.data.policyGroups[0].amountMinor,'0')
 const {boardPacketCsv}=await import('../../src/lib/board-packet-export.ts');const csv=boardPacketCsv((await s.listBoardPackets(db,'a'))[0].packet)
 assert.match(csv,/credit-risk profile is not included/)
 assert.match(csv,/No selected classes \(explicit zero\)/);assert.match(csv,/does not establish that the full portfolio has no holdings/)
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:{...base,zeroPolicyIds:['p','p']}}),/duplicate/i)
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',allocation:{...base,mappings:{Bonds:'p'}}}),/mapped/i)
 sql.close()
})
test('options and selected comparisons require admin and reject invalid selections',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts')
 await assert.rejects(s.boardPacketOptions(db,'u'))
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',budgets:[{budgetId:'missing',transactionIds:[]}]}))
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',budgets:[{budgetId:'x',transactionIds:[]},{budgetId:'x',transactionIds:[]}]}))
 sql.close()
})
test('empty transaction choice is explicit and later voided transactions cannot be selected',async()=>{
 const {sql,db}=setup()
 sql.exec(`INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bonds','UGX','a');
 INSERT INTO investment_transactions(id,investment_id,transaction_date,transaction_type,amount_minor,created_by) VALUES('t','i','2020-07-01','income',100,'a');
 INSERT INTO budget_lines(id,category,period_start,period_end,currency,amount_minor,source,created_by,request_key) VALUES('b','Income','2020-01-01','2020-12-31','UGX',200,'budget','a','bkey');`)
 const s=await import('../../src/server/board-packets/service.ts')
 const options=await s.boardPacketOptions(db,'a');assert.equal(options.budgets.transactions[0].id,'t')
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',budgets:[{budgetId:'b',transactionIds:[]}]})
 assert.equal(p.budgets?.data[0].selectedTotal,'0');assert.equal(p.omissions.length,5)
 sql.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('x','transaction','t','error','xkey','a')")
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',budgets:[{budgetId:'b',transactionIds:['t']}]}))
 sql.close()
})
test('explicit statement papers retain mappings, periods and exact captured results',async()=>{
 const {sql,db}=setup()
 sql.exec("INSERT INTO ledger_accounts(id,code,name,currency) VALUES('acct','001','Cash','UGX')")
 const s=await import('../../src/server/board-packets/service.ts')
 const selection={mode:'position',startDate:null,endDate:'2020-12-31',mappings:[{accountId:'acct',lineName:'Cash',polarity:'debit-minus-credit'}]}
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',statements:[selection]})
 assert.deepEqual(p.statements?.[0].selection,selection)
 assert.equal(p.statements?.[0].data.lines[0].valueMinor,'0')
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 sql.exec("UPDATE ledger_accounts SET name='Changed' WHERE id='acct'")
 assert.equal((await s.listBoardPackets(db,'a'))[0].packet.statements?.[0].data.accounts[0].name,'Cash')
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',statements:[{...selection,mappings:[{...selection.mappings[0],accountId:'unknown'}]}]}))
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',statements:[{...selection,mappings:[]}]}))
 await assert.rejects(s.previewBoardPacket(db,'u',{start:'2020-01-01',end:'2020-12-31',statements:[selection]}))
 sql.close()
})
test('statement papers honor their own periods and reject invalid selections',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts')
 sql.exec(`INSERT INTO ledger_accounts(id,code,name,currency) VALUES('cash','001','Cash','UGX'),('other','002','Other','UGX');`)
 function post(id:string,date:string,amount:number){sql.prepare("INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES(?,'UGX',?,'test','manual',?,'a')").run(id,date,id);sql.prepare("INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,'debit',?)").run(id+'d',id,'cash',amount);sql.prepare("INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,'credit',?)").run(id+'c',id,'other',amount);sql.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").run(id)}
 post('before','2020-01-01',100);post('during','2020-06-01',50);post('after','2020-12-01',20)
 const mapping={accountId:'cash',lineName:'Cash',polarity:'debit-minus-credit'}
 const activity={mode:'activity',startDate:'2020-05-01',endDate:'2020-07-01',mappings:[mapping]}
 const position={mode:'position',startDate:null,endDate:'2020-07-01',mappings:[mapping]}
 const base={start:'2021-01-01',end:'2021-12-31'}
 const options=await s.boardPacketOptions(db,'a');assert.equal(options.statementAccounts.length,2)
 const p=await s.previewBoardPacket(db,'a',{...base,statements:[activity,position]})
 assert.deepEqual(p.statements?.map(x=>x.data.lines[0].valueMinor),['50','150'])
 assert.equal(p.statements?.[0].data.startDate,'2020-05-01');assert.ok(!p.omissions.some(x=>x.includes('Statement working papers')))
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});post('later','2020-06-15',10)
 assert.equal((await s.listBoardPackets(db,'a'))[0].packet.statements?.[0].data.lines[0].valueMinor,'50')
 assert.equal((await s.previewBoardPacket(db,'a',{...base,statements:[activity]})).statements?.[0].data.lines[0].valueMinor,'60')
 for(const statements of [[],Array(11).fill(activity),[{...activity,startDate:'2020-02-30'}],[{...activity,mappings:[mapping,mapping]}],[{...position,startDate:'2020-01-01'}]])await assert.rejects(s.previewBoardPacket(db,'a',{...base,statements}))
 sql.close()
})
test('explicit sale requests and dated history are frozen with the board packet',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts')
 sql.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES('b','002','Buyer','a');
 INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,deadline_date,notes,created_by,request_key) VALUES('sale','m',10,100,'UGX','2020-01-02','2020-12-20','seller note','a','sale-key');
 INSERT INTO share_sale_interests(id,sale_id,member_id,interest_date,shares,notes,created_by,request_key) VALUES('interest','sale','b','2020-02-01',3,'bid note','a','interest-key'),('future','sale','b','2021-01-01',1,'future','a','future-key');
 INSERT INTO share_sale_status_events(id,sale_id,status_date,status,notes,created_by,request_key) VALUES('status','sale','2020-03-01','announced','announced','a','status-key'),('future-status','sale','2021-02-01','closed','later','a','future-status-key'); INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('future-sale','m',5,100,'UGX','2021-01-01','a','future-sale-key');`)
 const options=await s.boardPacketOptions(db,'a');assert.equal(options.saleRequests.find(x=>x.id==='sale')?.memberName,'Member')
 const input={start:'2020-01-01',end:'2020-12-31',saleRequestIds:['sale']}
 const p=await s.previewBoardPacket(db,'a',input)
 assert.equal(p.sales?.data.requests[0].memberNumber,'001');assert.equal(p.sales?.data.interests.length,1);assert.equal(p.sales?.data.interests[0].memberName,'Buyer');assert.equal(p.sales?.data.interests[0].provenance,'admin');assert.equal(p.sales?.data.statuses.length,1);assert.equal(p.sales?.data.statuses[0].status,'announced')
 assert.ok(p.sales?.capturedFrom);assert.ok(!p.omissions.some(x=>x.includes('Share-sale requests')))
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});sql.exec("UPDATE members SET full_name='Changed' WHERE id='m'")
 assert.equal((await s.listBoardPackets(db,'a'))[0].packet.sales?.data.requests[0].memberName,'Member')
 await assert.rejects(s.previewBoardPacket(db,'a',{...input,saleRequestIds:['sale','sale']}));await assert.rejects(s.previewBoardPacket(db,'a',{...input,saleRequestIds:['missing']}));await assert.rejects(s.previewBoardPacket(db,'a',{...input,saleRequestIds:['future-sale']}));await assert.rejects(s.previewBoardPacket(db,'u',input));sql.close()
})
test('selected sale interests preserve member-submitted and administrative provenance',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts')
 sql.exec(`INSERT INTO members(id,member_number,full_name,created_by) VALUES('b','002','Buyer','a');
 INSERT INTO member_user_links(id,user_id,member_id,linked_by) VALUES('link','u','b','a');
 INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('sale','m',10,100,'UGX','2020-01-01','a','sale-key');
 INSERT INTO share_sale_announcements(id,sale_id,published_by,publish_key) VALUES('announce','sale','a','pub-key');
 INSERT INTO member_sale_interest_requests(id,announcement_id,member_id,actor_id,shares,request_key) VALUES('member-interest','announce','b','u',1,'member-key');
 INSERT INTO share_sale_interests(id,sale_id,member_id,interest_date,shares,created_by,request_key) VALUES('admin-interest','sale','b','2020-02-01',2,'a','admin-key');`)
 const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'9999-12-31',saleRequestIds:['sale']})
 assert.deepEqual(Object.fromEntries(p.sales!.data.interests.map(i=>[i.id,i.provenance])),{'admin-interest':'admin','member-interest':'member'})
 sql.close()
})
test('budget cash selection is distinct and frozen with its evidence',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts')
 sql.exec(`INSERT INTO budget_lines(id,category,period_start,period_end,currency,amount_minor,source,created_by,request_key) VALUES('b','Income','2020-01-01','2020-12-31','UGX',200,'budget','a','bkey');
 INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) VALUES('c1','2020-06-01','receipt','90071992547409930','UGX','Member','=formula','Receipt','c1','a'),('c2','2020-07-01','payment','300','UGX','Supplier','ref','Payment','c2','a'),('c3','2020-08-01','payment','50','UGX','','','Excluded','c3','a'),('outside','2021-01-01','payment','50','UGX','','','Outside','outside','a'),('foreign','2020-08-01','payment','50','USD','','','Foreign','foreign','a');`)
 const input={start:'2020-01-01',end:'2020-12-31',budgets:[{budgetId:'b',transactionIds:[],cashEntryIds:['c1','c2']}]}
 const p=await s.previewBoardPacket(db,'a',input)
 const b=p.budgets!.data[0]
 assert.equal(b.selectedTotal,'0');assert.equal(b.difference,'-200')
 assert.equal(b.cash?.receiptsTotal,'90071992547409930');assert.equal(b.cash?.paymentsTotal,'300');assert.ok(b.cash?.excluded.some(e=>e.id==='c3'))
 assert.deepEqual(p.budgets!.selection,input.budgets)
 sql.exec("INSERT INTO cash_entry_voids(id,entry_id,reason,request_key,created_by) VALUES('void','c1','later','void','a')")
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 assert.equal((await s.listBoardPackets(db,'a'))[0].packet.budgets!.data[0].cash?.selected[0].reference,'=formula')
 await assert.rejects(s.previewBoardPacket(db,'a',input))
 await assert.rejects(s.previewBoardPacket(db,'a',{...input,budgets:[{...input.budgets[0],cashEntryIds:['c2','c2']}]}))
 await assert.rejects(s.previewBoardPacket(db,'u',input))
 for(const invalid of ['outside','foreign','missing']) await assert.rejects(s.previewBoardPacket(db,'a',{...input,budgets:[{...input.budgets[0],cashEntryIds:[invalid]}]}))
 const legacy=await s.previewBoardPacket(db,'a',{...input,budgets:[{budgetId:'b',transactionIds:[]}]})
 assert.equal(legacy.budgets!.data[0].cash,undefined)
 const empty=await s.previewBoardPacket(db,'a',{...input,budgets:[{budgetId:'b',transactionIds:[],cashEntryIds:[]}]})
 assert.equal(empty.budgets!.data[0].cash?.receiptsTotal,'0')
 sql.close()
})

test('budget comparison captures an explicit cash basis and preserves its frozen variance',async()=>{
 const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts')
 sql.exec(`INSERT INTO budget_lines(id,category,period_start,period_end,currency,amount_minor,source,created_by,request_key) VALUES('b','Expenses','2020-01-01','2020-12-31','UGX',200,'budget','a','basis-b');
 INSERT INTO cash_entries(id,entry_date,direction,amount_minor,currency,counterparty,reference,description,request_key,created_by) VALUES('receipt','2020-06-01','receipt','900','UGX','','','receipt','basis-r','a'),('payment','2020-07-01','payment','300','UGX','','','payment','basis-p','a');`)
 const selection={budgetId:'b',transactionIds:[],cashEntryIds:['receipt','payment'],comparisonBasis:'cash_payments'}
 const input={start:'2020-01-01',end:'2020-12-31',budgets:[selection]}
 const preview=await s.previewBoardPacket(db,'a',input)
 assert.equal(preview.budgets!.data[0].comparisonBasis,'cash_payments')
 assert.equal(preview.budgets!.data[0].selectedTotal,'300')
 assert.equal(preview.budgets!.data[0].difference,'100')
 assert.deepEqual(preview.budgets!.selection,[selection])
 await s.saveBoardPacket(db,'a',{previewId:preview.previewId,requestKey:key})
 sql.exec("INSERT INTO cash_entry_voids(id,entry_id,reason,request_key,created_by) VALUES('v','payment','later','basis-v','a')")
 const frozen=(await s.listBoardPackets(db,'a'))[0].packet.budgets!
 assert.equal(frozen.data[0].comparisonBasis,'cash_payments');assert.equal(frozen.data[0].difference,'100')
 await assert.rejects(s.previewBoardPacket(db,'a',{...input,budgets:[{budgetId:'b',transactionIds:[],comparisonBasis:'cash_receipts'}]}))
 await assert.rejects(s.previewBoardPacket(db,'a',{...input,budgets:[{...selection,comparisonBasis:'unknown'}]}))
 sql.close()
})


test('optional calculated totals are frozen when a later loan is entered',async()=>{const {sql,db}=setup(),s=await import('../../src/server/board-packets/service.ts');const p=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',includeCalculatedLending:true});assert.equal(p.calculatedLending?.data.eligible,0);assert.ok(!p.omissions.some(x=>x.includes('calculated lending totals')));sql.exec("INSERT INTO loans(id,member_id,principal_minor,currency,disbursement_date,terms,created_by) VALUES('late','m',1000,'UGX','2020-01-01','terms','a')");await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key});const frozen=(await s.listBoardPackets(db,'a'))[0].packet.calculatedLending;assert.equal(frozen?.data.eligible,0);const next=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',includeCalculatedLending:true});assert.equal(next.calculatedLending?.data.eligible,1);assert.equal(next.calculatedLending?.data.omitted.unconfigured,1);await assert.rejects(s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31',includeCalculatedLending:'yes'}));sql.close()})

test('combined portfolio selection is captured in a frozen board packet',async()=>{
 const {sql,db}=setup()
 sql.exec("INSERT INTO investments(id,name,asset_class,currency,created_by) VALUES('i','Bond','Bonds','UGX','a'); INSERT INTO investment_valuations(id,investment_id,valuation_date,amount_minor,currency,basis,created_by) VALUES('v','i','2020-06-01',100,'UGX','cost','a')")
 const s=await import('../../src/server/board-packets/service.ts')
 const choice={currency:'UGX',asOf:'2026-08-31',selected:{i:'v'},mappings:{},zeroPolicyIds:[],cashAccountIds:[],includeLending:false,overlapReviewed:true,liquidityReview:{investmentIds:['i'],cashAccountIds:[]},turboReview:{investmentIds:['i'],memoReferences:{i:'Memo reference 1'}},equityReview:{classifications:[{investmentId:'i',company:'Company A',sector:'Banking'}]}}
 const p=await s.previewBoardPacket(db,'a',{start:'2026-05-01',end:'2026-08-31',combinedAllocation:choice})
 assert.equal(p.combinedAllocation?.data.allocation.total,'100');assert.equal(p.combinedAllocation?.data.liquidity?.amountMinor,'100');assert.equal(p.combinedAllocation?.data.liquidity?.comparison,'within');assert.equal(p.combinedAllocation?.data.turboReview?.deals[0]?.comparison,'above')
 await s.saveBoardPacket(db,'a',{previewId:p.previewId,requestKey:key})
 sql.exec("INSERT INTO investment_source_voids(id,source_kind,source_id,reason,request_key,created_by) VALUES('void','valuation','v','correction','void-key','a')")
 const saved=(await s.listBoardPackets(db,'a'))[0].packet
 assert.equal(saved.combinedAllocation?.data.allocation.total,'100');assert.deepEqual(saved.combinedAllocation?.data.liquidity?.investmentIds,['i']);assert.equal(saved.combinedAllocation?.data.turboReview?.deals[0]?.name,'Bond');assert.equal(saved.combinedAllocation?.data.turboReview?.deals[0]?.memoReference,'Memo reference 1');assert.equal(saved.combinedAllocation?.data.equityReview?.companies[0]?.name,'Company A')
 const {boardPacketCsv}=await import('../../src/lib/board-packet-export.ts')
 assert.match(boardPacketCsv(saved),/Combined source evidence/);assert.match(boardPacketCsv(saved),/Selected-source liquidity review/);assert.match(boardPacketCsv(saved),/HIGH RISK/);assert.match(boardPacketCsv(saved),/Memo reference 1/);assert.match(boardPacketCsv(saved),/Banking/)
 await assert.rejects(s.previewBoardPacket(db,'a',{start:'2026-05-01',end:'2026-08-31',combinedAllocation:{...choice,overlapReviewed:false}}),/overlap/i)
 sql.close()
})

test('a revoked administrator cannot resolve a saved draft retry',async()=>{
 const {sql,db}=setup()
 const s=await import('../../src/server/board-packets/service.ts')
 const preview=await s.previewBoardPacket(db,'a',{start:'2020-01-01',end:'2020-12-31'})
 await s.saveBoardPacket(db,'a',{previewId:preview.previewId,requestKey:key})
 let read:unknown='not observed'
 const racing={...db,prepare(query:string){const original=db.prepare(query);if(!query.startsWith('SELECT id,preview_id AS previewId,created_by AS createdBy FROM board_packets WHERE request_key='))return original;return {bind(...args:unknown[]){const bound=original.bind(...args);return {...bound,async first(){sql.exec("DELETE FROM app_user_roles WHERE user_id='a'");read=await bound.first();return read}}}}}} as unknown as D1Database
 await assert.rejects(s.saveBoardPacket(racing,'a',{previewId:preview.previewId,requestKey:key}))
 assert.equal(read,null)
 sql.close()
})
