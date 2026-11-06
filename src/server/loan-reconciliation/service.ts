type Kind = 'loan' | 'repayment'
type Source = { kind:Kind; sourceId:string; loanId:string; memberId:string; memberName:string|null; sourceDate:string; currency:string|null; amountMinor:string; voidedAt:string|null; voidReason:string|null }
type VersionRow = { journalId:string; sourceType:string; rawSourceId:string; journalDate:string; journalCurrency:string; reversesEntryId:string|null; correctionKind:Kind|null; correctionSourceId:string|null; predecessorReversalId:string|null; reversalId:string|null; reversalDate:string|null; reversalCurrency:string|null }
type JournalLine = { journalId:string; side:string; amountMinor:string }
type Version = { journalId:string; type:'original'|'replacement'; journalDate:string; journalCurrency:string; predecessorReversalId:string|null; reversalId:string|null; reversalDate:string|null; debitMinor:string; creditMinor:string; issues:string[] }
export type Reconciliation = { snapshotAt:string; sources:(Source & {status:'unposted'|'active'|'all reversed'|'review required'; versions:Version[]; issues:string[]})[]; anomalies:{journalId:string; message:string}[] }

/** Current recorded source/journal relationships, not calculated loan balances. */
export async function loanReconciliation(db:D1Database, actorId:string|null):Promise<Reconciliation>{
 if(!actorId)throw new Error('Unauthorized')
 const guard="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
 const [roles,clock,sources,journals,lines]=await db.batch([
  db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(actorId),
  db.prepare(`SELECT datetime('now') AS snapshotAt WHERE ${guard}`).bind(actorId),
  db.prepare(`SELECT 'loan' AS kind,l.id AS sourceId,l.id AS loanId,l.member_id AS memberId,m.full_name AS memberName,l.disbursement_date AS sourceDate,l.currency,CAST(l.principal_minor AS TEXT) AS amountMinor,(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AS voidedAt,(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AS voidReason FROM loans l LEFT JOIN members m ON m.id=l.member_id WHERE ${guard} UNION ALL SELECT 'repayment',r.id,r.loan_id,l.member_id,m.full_name,r.payment_date,l.currency,CAST(r.amount_minor AS TEXT),(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=r.id),(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=r.id) FROM loan_repayments r LEFT JOIN loans l ON l.id=r.loan_id LEFT JOIN members m ON m.id=l.member_id WHERE ${guard} ORDER BY kind,sourceDate,sourceId`).bind(actorId,actorId),
  db.prepare(`SELECT j.id AS journalId,j.source_type AS sourceType,j.source_id AS rawSourceId,j.effective_date AS journalDate,j.currency AS journalCurrency,j.reverses_entry_id AS reversesEntryId,c.source_kind AS correctionKind,c.source_id AS correctionSourceId,c.predecessor_reversal_id AS predecessorReversalId,r.id AS reversalId,r.effective_date AS reversalDate,r.currency AS reversalCurrency FROM journal_entries j LEFT JOIN journal_corrections c ON c.journal_id=j.id LEFT JOIN journal_entries r ON r.reverses_entry_id=j.id AND r.status='posted' WHERE j.status='posted' AND j.source_type IN ('loan-disbursement','loan-repayment','loan-disbursement-correction','loan-repayment-correction') AND ${guard} ORDER BY j.effective_date,j.id`).bind(actorId),
  db.prepare(`SELECT l.entry_id AS journalId,l.side,CAST(l.amount_minor AS TEXT) AS amountMinor FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id WHERE j.status='posted' AND j.source_type IN ('loan-disbursement','loan-repayment','loan-disbursement-correction','loan-repayment-correction') AND ${guard}`).bind(actorId),
 ])
 if((roles.results[0] as {role:string}|undefined)?.role!=='admin')throw new Error('Unauthorized')
 const result:Reconciliation={snapshotAt:(clock.results[0] as {snapshotAt:string}).snapshotAt,sources:[],anomalies:[]}
 const bySource=new Map<string,Reconciliation['sources'][number]>()
 for(const s of sources.results as Source[]){const entry:Reconciliation['sources'][number]={...s,status:'unposted',versions:[],issues:[]};if(!s.memberName||!s.currency)entry.issues.push('Source has a missing member or loan');result.sources.push(entry);bySource.set(`${s.kind}:${s.sourceId}`,entry)}
 const lineTotals=new Map<string,{debit:bigint;credit:bigint;invalid:boolean}>()
 for(const l of lines.results as JournalLine[]){const sums=lineTotals.get(l.journalId)??{debit:0n,credit:0n,invalid:false};if(!/^\d+$/.test(l.amountMinor)||!['debit','credit'].includes(l.side))sums.invalid=true;else if(l.side==='debit')sums.debit+=BigInt(l.amountMinor);else sums.credit+=BigInt(l.amountMinor);lineTotals.set(l.journalId,sums)}
 const allVersions=journals.results as VersionRow[]
 for(const j of allVersions){
  const replacement=j.sourceType.endsWith('-correction'),kind:Kind=j.sourceType.startsWith('loan-disbursement')?'loan':'repayment',sourceId=replacement?j.correctionSourceId:j.rawSourceId
  const source=sourceId?bySource.get(`${kind}:${sourceId}`):undefined
  if(!source){result.anomalies.push({journalId:j.journalId,message:replacement?'Replacement is missing its matching source or correction link.':'Original journal has no matching source record.'});continue}
  const issues:string[]=[],totals=lineTotals.get(j.journalId)??{debit:0n,credit:0n,invalid:true}
  if(replacement&&(j.correctionKind!==kind||!j.predecessorReversalId))issues.push('Replacement link is incomplete or has the wrong source kind')
  if(j.journalCurrency!==source.currency)issues.push('Journal currency differs from source')
  if(!replacement&&j.journalDate!==source.sourceDate)issues.push('Original journal date differs from source')
  if(totals.invalid||totals.debit!==BigInt(source.amountMinor)||totals.credit!==BigInt(source.amountMinor))issues.push('Journal totals differ from source amount')
  if(j.reversesEntryId)issues.push('A source posting unexpectedly reverses another journal')
  if(j.reversalId&&(j.reversalCurrency!==j.journalCurrency||!j.reversalDate||j.reversalDate<j.journalDate))issues.push('Reversal currency or date requires review')
  source.versions.push({journalId:j.journalId,type:replacement?'replacement':'original',journalDate:j.journalDate,journalCurrency:j.journalCurrency,predecessorReversalId:j.predecessorReversalId,reversalId:j.reversalId,reversalDate:j.reversalDate,debitMinor:String(totals.debit),creditMinor:String(totals.credit),issues})
 }
 for(const source of result.sources){
  const originals=source.versions.filter(v=>v.type==='original'),active=source.versions.filter(v=>!v.reversalId)
  if(source.versions.length&&originals.length!==1)source.issues.push('Expected one original source journal')
  if(active.length>1)source.issues.push('More than one source journal is active')
  if(source.voidedAt&&source.versions.some(v=>!v.reversalId||!v.reversalDate||v.reversalDate>source.voidedAt!.slice(0,10)))source.issues.push('Source was voided without an effective reversal for every posting by the void date')
  for(const v of source.versions)if(v.type==='replacement'){
   const previous=source.versions.find(p=>p.reversalId===v.predecessorReversalId)
   if(!previous)v.issues.push('Predecessor reversal is not in this source history')
   else if(!previous.reversalDate||v.journalDate<previous.reversalDate)v.issues.push('Replacement predates its predecessor reversal')
   if(source.versions.filter(p=>p.predecessorReversalId===v.predecessorReversalId).length>1)v.issues.push('Multiple replacements share the same predecessor reversal')
  }
  if(source.issues.length||source.versions.some(v=>v.issues.length))source.status='review required'
  else if(!source.versions.length)source.status='unposted'
  else if(active.length===1)source.status='active'
  else source.status='all reversed'
 }
 return result
}
