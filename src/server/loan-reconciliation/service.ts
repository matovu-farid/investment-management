type Kind = 'loan' | 'repayment'
type Source = { kind:Kind; sourceId:string; loanId:string; memberId:string; memberName:string|null; sourceDate:string; currency:string|null; amountMinor:string; voidedAt:string|null; voidReason:string|null }
type VersionRow = { journalId:string; sourceType:string; rawSourceId:string; journalDate:string; journalCurrency:string; reversesEntryId:string|null; correctionKind:Kind|null; correctionSourceId:string|null; predecessorReversalId:string|null; reversalId:string|null; reversalDate:string|null; reversalCurrency:string|null }
type BillingEvent = { id:string; loanId:string; repaymentId:string|null; eventDate:string; accruedMinor:string; accrualJournalId:string|null; repaymentJournalId:string|null; reversedAt:string|null }
type Opening = {loanId:string;journalId:string;amountMinor:string;currency:string;openingDate:string;correctionReversalId:string|null;isCorrection:number;correctionReason:string|null}
type OpeningInterest = {loanId:string;openingJournalId:string;journalId:string|null;amountMinor:string;correctionReversalId:string|null}
type JournalLine = { journalId:string; side:string; amountMinor:string }
type Version = { journalId:string; type:'original'|'replacement'|'billing repayment'|'opening'; billingEventId:string|null; journalDate:string; journalCurrency:string; predecessorReversalId:string|null; reversalId:string|null; reversalDate:string|null; debitMinor:string; creditMinor:string; issues:string[] }
type Accrual = {eventId:string;loanId:string;eventDate:string;currency:string|null;amountMinor:string;journalId:string|null;reversalId:string|null;reversalDate:string|null;reversedAt:string|null;issues:string[]}
export type Reconciliation = { snapshotAt:string; sources:(Source & {status:'unposted'|'active'|'all reversed'|'review required'; versions:Version[]; issues:string[]; zeroPrincipalOpeningDate:string|null; zeroPrincipalHistory:{openingDate:string;corrected:boolean;reason:string|null}[]})[]; accruals:Accrual[]; openingInterest:Accrual[]; anomalies:{journalId:string; message:string}[] }

/** Current recorded source/journal relationships, not calculated loan balances. */
export async function loanReconciliation(db:D1Database, actorId:string|null):Promise<Reconciliation>{
 if(!actorId)throw new Error('Unauthorized')
 const guard="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
 const [roles,clock,sources,journals,lines,billing,openings,openingInterest]=await db.batch([
  db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),
  db.prepare(`SELECT datetime('now') AS snapshotAt WHERE ${guard}`).bind(actorId),
  db.prepare(`SELECT 'loan' AS kind,l.id AS sourceId,l.id AS loanId,l.member_id AS memberId,m.full_name AS memberName,l.disbursement_date AS sourceDate,l.currency,CAST(l.principal_minor AS TEXT) AS amountMinor,(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AS voidedAt,(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AS voidReason FROM loans l LEFT JOIN members m ON m.id=l.member_id WHERE ${guard} UNION ALL SELECT 'repayment',r.id,r.loan_id,l.member_id,m.full_name,r.payment_date,l.currency,CAST(r.amount_minor AS TEXT),(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=r.id),(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=r.id) FROM loan_repayments r LEFT JOIN loans l ON l.id=r.loan_id LEFT JOIN members m ON m.id=l.member_id WHERE ${guard} ORDER BY kind,sourceDate,sourceId`).bind(actorId,actorId),
  db.prepare(`SELECT j.id AS journalId,j.source_type AS sourceType,j.source_id AS rawSourceId,j.effective_date AS journalDate,j.currency AS journalCurrency,j.reverses_entry_id AS reversesEntryId,c.source_kind AS correctionKind,c.source_id AS correctionSourceId,c.predecessor_reversal_id AS predecessorReversalId,r.id AS reversalId,r.effective_date AS reversalDate,r.currency AS reversalCurrency FROM journal_entries j LEFT JOIN journal_corrections c ON c.journal_id=j.id LEFT JOIN journal_entries r ON r.reverses_entry_id=j.id AND r.status='posted' WHERE j.status='posted' AND j.source_type IN ('loan-disbursement','loan-repayment','loan-disbursement-correction','loan-repayment-correction','loan-billing-repayment','loan-billing-accrual','loan-opening','loan-billing-opening-interest') AND ${guard} ORDER BY j.effective_date,j.id`).bind(actorId),
  db.prepare(`SELECT l.entry_id AS journalId,l.side,CAST(l.amount_minor AS TEXT) AS amountMinor FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id WHERE j.status='posted' AND j.source_type IN ('loan-disbursement','loan-repayment','loan-disbursement-correction','loan-repayment-correction','loan-billing-repayment','loan-billing-accrual','loan-opening','loan-billing-opening-interest') AND ${guard}`).bind(actorId),
  db.prepare(`SELECT e.id,e.loan_id AS loanId,e.repayment_id AS repaymentId,e.event_date AS eventDate,CAST(e.accrued_minor AS TEXT) AS accruedMinor,e.accrual_journal_id AS accrualJournalId,e.repayment_journal_id AS repaymentJournalId,v.created_at AS reversedAt FROM loan_billing_events e LEFT JOIN loan_billing_event_voids v ON v.event_id=e.id AND v.status='final' WHERE ${guard} ORDER BY e.rowid`).bind(actorId),
  db.prepare(`SELECT loan_id AS loanId,journal_id AS journalId,CAST(principal_minor AS TEXT) AS amountMinor,currency,opening_date AS openingDate,NULL AS correctionReversalId,0 AS isCorrection,NULL AS correctionReason FROM loan_openings WHERE ${guard} UNION ALL SELECT loan_id,original_journal_id,CAST(json_extract(original_details,'$.principalMinor') AS TEXT),json_extract(original_details,'$.currency'),json_extract(original_details,'$.openingDate'),reversal_journal_id,1,reason FROM loan_opening_corrections WHERE status='final' AND ${guard}`).bind(actorId,actorId),
  db.prepare(`SELECT loan_id AS loanId,opening_journal_id AS openingJournalId,interest_journal_id AS journalId,CAST(interest_due_minor AS TEXT) AS amountMinor,NULL AS correctionReversalId FROM loan_billing_opening_states WHERE ${guard} UNION ALL SELECT loan_id,json_extract(original_details,'$.openingJournalId'),json_extract(original_details,'$.interestJournalId'),CAST(json_extract(original_details,'$.interestDueMinor') AS TEXT),reversal_journal_id FROM loan_billing_opening_state_corrections WHERE status='final' AND ${guard}`).bind(actorId,actorId),
 ])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 const result:Reconciliation={snapshotAt:(clock.results[0] as {snapshotAt:string}).snapshotAt,sources:[],accruals:[],openingInterest:[],anomalies:[]}
 const bySource=new Map<string,Reconciliation['sources'][number]>()
 for(const s of sources.results as Source[]){const entry:Reconciliation['sources'][number]={...s,status:'unposted',versions:[],issues:[],zeroPrincipalOpeningDate:null,zeroPrincipalHistory:[]};if(!s.memberName||!s.currency)entry.issues.push('Source has a missing member or loan');result.sources.push(entry);bySource.set(`${s.kind}:${s.sourceId}`,entry)}
 const lineTotals=new Map<string,{debit:bigint;credit:bigint;invalid:boolean}>()
 for(const l of lines.results as JournalLine[]){const sums=lineTotals.get(l.journalId)??{debit:0n,credit:0n,invalid:false};if(!/^\d+$/.test(l.amountMinor)||!['debit','credit'].includes(l.side))sums.invalid=true;else if(l.side==='debit')sums.debit+=BigInt(l.amountMinor);else sums.credit+=BigInt(l.amountMinor);lineTotals.set(l.journalId,sums)}
 const allVersions=journals.results as VersionRow[]
 const openingRows=openings.results as Opening[],interestRows=openingInterest.results as OpeningInterest[]
 const billingEvents=billing.results as BillingEvent[],byEvent=new Map(billingEvents.map(e=>[e.id,e]))
 for(const j of allVersions){
  if(j.sourceType==='loan-billing-accrual'||j.sourceType==='loan-billing-opening-interest')continue
  if(j.sourceType==='loan-opening'){
   const o=openingRows.find(x=>x.journalId===j.journalId),source=o&&bySource.get(`loan:${o.loanId}`),totals=lineTotals.get(j.journalId)??{debit:0n,credit:0n,invalid:true},issues:string[]=[]
   if(!o||!source){result.anomalies.push({journalId:j.journalId,message:'Opening journal has no matching opening record or correction history.'});continue}
   if(j.rawSourceId!==j.journalId||j.journalCurrency!==o.currency||j.journalCurrency!==source.currency||j.journalDate!==o.openingDate||j.reversesEntryId)issues.push('Opening journal details differ from the reviewed opening')
   if(!/^\d+$/.test(o.amountMinor)||totals.invalid||totals.debit!==BigInt(o.amountMinor)||totals.credit!==BigInt(o.amountMinor))issues.push('Opening journal totals differ from the reviewed opening')
   if((o.correctionReversalId??null)!==(j.reversalId??null))issues.push('Opening correction does not match journal reversal history')
   source.versions.push({journalId:j.journalId,type:'opening',billingEventId:null,journalDate:j.journalDate,journalCurrency:j.journalCurrency,predecessorReversalId:null,reversalId:j.reversalId,reversalDate:j.reversalDate,debitMinor:String(totals.debit),creditMinor:String(totals.credit),issues});continue
  }
  const billingRepayment=j.sourceType==='loan-billing-repayment',event=billingRepayment?byEvent.get(j.rawSourceId):undefined
  const replacement=j.sourceType.endsWith('-correction'),kind:Kind=j.sourceType.startsWith('loan-disbursement')?'loan':'repayment',sourceId=billingRepayment?event?.repaymentId:replacement?j.correctionSourceId:j.rawSourceId
  const source=sourceId?bySource.get(`${kind}:${sourceId}`):undefined
  if(!source){result.anomalies.push({journalId:j.journalId,message:replacement?'Replacement is missing its matching source or correction link.':'Original journal has no matching source record.'});continue}
  const issues:string[]=[],totals=lineTotals.get(j.journalId)??{debit:0n,credit:0n,invalid:true}
  if(replacement&&(j.correctionKind!==kind||!j.predecessorReversalId))issues.push('Replacement link is incomplete or has the wrong source kind')
  if(billingRepayment&&(!event||event.repaymentJournalId!==j.journalId||event.loanId!==source.loanId||event.eventDate!==j.journalDate||!!event.reversedAt!==!!j.reversalId))issues.push('Billing event or correction does not match journal history')
  if(j.journalCurrency!==source.currency)issues.push('Journal currency differs from source')
  if(!replacement&&j.journalDate!==source.sourceDate)issues.push('Original journal date differs from source')
  if(totals.invalid||totals.debit!==BigInt(source.amountMinor)||totals.credit!==BigInt(source.amountMinor))issues.push('Journal totals differ from source amount')
  if(j.reversesEntryId)issues.push('A source posting unexpectedly reverses another journal')
  if(j.reversalId&&(j.reversalCurrency!==j.journalCurrency||!j.reversalDate||j.reversalDate<j.journalDate))issues.push('Reversal currency or date requires review')
  source.versions.push({journalId:j.journalId,type:billingRepayment?'billing repayment':replacement?'replacement':'original',billingEventId:event?.id??null,journalDate:j.journalDate,journalCurrency:j.journalCurrency,predecessorReversalId:j.predecessorReversalId,reversalId:j.reversalId,reversalDate:j.reversalDate,debitMinor:String(totals.debit),creditMinor:String(totals.credit),issues})
 }
 for(const o of openingRows)if(o.amountMinor==='0'){const source=bySource.get(`loan:${o.loanId}`);if(!source)result.anomalies.push({journalId:o.journalId,message:'Opening record has no matching loan.'});else {source.zeroPrincipalHistory.push({openingDate:o.openingDate,corrected:!!o.isCorrection,reason:o.correctionReason??null});if(!o.isCorrection)source.zeroPrincipalOpeningDate=o.openingDate}}else if(!allVersions.some(j=>j.journalId===o.journalId&&j.sourceType==='loan-opening')){const source=bySource.get(`loan:${o.loanId}`);if(source)source.issues.push('Opening journal is missing or linked incorrectly');else result.anomalies.push({journalId:o.journalId,message:'Opening record has no matching loan.'})}
 for(const state of interestRows){
  if(!state.journalId&&state.amountMinor==='0')continue
  const j=allVersions.find(x=>x.journalId===state.journalId),o=openingRows.find(x=>x.journalId===state.openingJournalId),totals=j?lineTotals.get(j.journalId):undefined,issues:string[]=[]
  if(!o||o.loanId!==state.loanId)issues.push('Opening interest has no matching principal opening')
  if(!j||j.sourceType!=='loan-billing-opening-interest'||j.rawSourceId!==j.journalId)issues.push('Opening interest journal is missing or linked incorrectly')
  if(j&&(j.journalCurrency!==o?.currency||j.journalDate!==o?.openingDate||j.reversesEntryId))issues.push('Opening interest journal details differ from the opening')
  if(!/^\d+$/.test(state.amountMinor)||!totals||totals.invalid||totals.debit!==BigInt(state.amountMinor)||totals.credit!==BigInt(state.amountMinor))issues.push('Opening interest journal totals differ from the reviewed state')
  if(j&&(state.correctionReversalId??null)!==(j.reversalId??null))issues.push('Opening interest correction does not match journal reversal history')
  result.openingInterest.push({eventId:state.journalId??state.openingJournalId,loanId:state.loanId,eventDate:o?.openingDate??j?.journalDate??'unknown',currency:o?.currency??null,amountMinor:state.amountMinor,journalId:state.journalId,reversalId:j?.reversalId??null,reversalDate:j?.reversalDate??null,reversedAt:state.correctionReversalId,issues})
 }
 for(const j of allVersions.filter(x=>x.sourceType==='loan-billing-opening-interest'))if(!interestRows.some(s=>s.journalId===j.journalId))result.anomalies.push({journalId:j.journalId,message:'Opening interest journal has no matching reviewed state.'})
 for(const e of billingEvents){
  if(e.repaymentId){const source=bySource.get(`repayment:${e.repaymentId}`),j=allVersions.find(x=>x.journalId===e.repaymentJournalId);if(!source)result.anomalies.push({journalId:e.repaymentJournalId??e.id,message:'Billing repayment event has no matching recorded repayment.'});else if(!j||j.sourceType!=='loan-billing-repayment'||j.rawSourceId!==e.id)source.issues.push('Billing repayment journal is missing or linked to a different event')}
  if(BigInt(e.accruedMinor)===0n&&!e.accrualJournalId)continue
  const j=allVersions.find(x=>x.journalId===e.accrualJournalId),loan=bySource.get(`loan:${e.loanId}`),totals=j?lineTotals.get(j.journalId):undefined,issues:string[]=[]
  if(!loan)issues.push('Billing event has no matching loan')
  if(!j||j.sourceType!=='loan-billing-accrual'||j.rawSourceId!==e.id)issues.push('Accrual journal is missing or linked to a different event')
  if(j&&(j.journalCurrency!==loan?.currency||j.journalDate!==e.eventDate||j.reversesEntryId))issues.push('Accrual journal details differ from the billing event')
  if(!totals||totals.invalid||totals.debit!==BigInt(e.accruedMinor)||totals.credit!==BigInt(e.accruedMinor))issues.push('Accrual journal totals differ from the event')
  if(j&&!!e.reversedAt!==!!j.reversalId)issues.push('Billing correction does not match journal reversal history')
  result.accruals.push({eventId:e.id,loanId:e.loanId,eventDate:e.eventDate,currency:loan?.currency??null,amountMinor:e.accruedMinor,journalId:e.accrualJournalId,reversalId:j?.reversalId??null,reversalDate:j?.reversalDate??null,reversedAt:e.reversedAt,issues})
 }
 for(const j of allVersions.filter(x=>x.sourceType==='loan-billing-accrual'))if(!byEvent.has(j.rawSourceId))result.anomalies.push({journalId:j.journalId,message:'Billing accrual has no matching event.'})
 for(const source of result.sources){
  const originals=source.versions.filter(v=>v.type==='original'),active=source.versions.filter(v=>!v.reversalId)
  if(originals.length>1||(source.versions.some(v=>v.type==='replacement')&&originals.length!==1))source.issues.push('Expected one original source journal')
  if(active.length>1)source.issues.push('More than one source journal is active')
  if(source.voidedAt&&source.versions.some(v=>!v.reversalId||!v.reversalDate||v.reversalDate>source.voidedAt!.slice(0,10)))source.issues.push('Source was voided without an effective reversal for every posting by the void date')
  for(const v of source.versions)if(v.type==='replacement'){
   const previous=source.versions.find(p=>p.reversalId===v.predecessorReversalId)
   if(!previous)v.issues.push('Predecessor reversal is not in this source history')
   else if(!previous.reversalDate||v.journalDate<previous.reversalDate)v.issues.push('Replacement predates its predecessor reversal')
   if(source.versions.filter(p=>p.predecessorReversalId===v.predecessorReversalId).length>1)v.issues.push('Multiple replacements share the same predecessor reversal')
  }
  if(source.issues.length||source.versions.some(v=>v.issues.length))source.status='review required'
  else if(source.zeroPrincipalOpeningDate)source.status='active'
  else if(!source.versions.length)source.status='unposted'
  else if(active.length===1)source.status='active'
  else source.status='all reversed'
 }
 return result
}
