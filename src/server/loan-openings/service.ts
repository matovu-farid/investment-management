type Opening={loanId:string;journalId:string;memberId:string;principalMinor:number;currency:string;openingDate:string;reviewedOriginalPrincipal:number;reviewedDisbursementDate:string;receivableAccountId:string;clearingAccountId:string;source:string;createdBy:string;requestKey:string}
const admin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
function text(v:unknown,max=128){if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>max)throw new Error('Invalid input');return v}
export async function listLoanOpenings(db:D1Database,actor:string|null){
 if(!actor)throw new Error('Unauthorized')
 const [loans,accounts,openings,states,permission]=await db.batch([
  db.prepare(`SELECT l.id,l.member_id AS memberId,m.full_name AS memberName,CAST(l.principal_minor AS TEXT) AS principalMinor,l.currency,l.disbursement_date AS openingDate FROM loans l JOIN members m ON m.id=l.member_id WHERE ${admin} AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) ORDER BY l.disbursement_date,l.id`).bind(actor),
  db.prepare(`SELECT id,code,name,currency FROM ledger_accounts WHERE ${admin} ORDER BY code`).bind(actor),
  db.prepare(`SELECT loan_id AS loanId,journal_id AS journalId,CAST(principal_minor AS TEXT) AS principalMinor,currency,opening_date AS openingDate,receivable_account_id AS receivableAccountId,clearing_account_id AS clearingAccountId,source,created_by AS createdBy,created_at AS createdAt FROM loan_openings WHERE ${admin}`).bind(actor),
  db.prepare(`SELECT loan_id AS loanId, opening_journal_id AS openingJournalId,rate_basis_points AS rateBasisPoints,period_days AS periodDays,cutoff_rate_basis_points AS cutoffRateBasisPoints,cutoff_period_days AS cutoffPeriodDays,CAST(interest_due_minor AS TEXT) AS interestDueMinor,CAST(recognized_interest_minor AS TEXT) AS recognizedInterestMinor,minimum_assessed AS minimumAssessed,interest_receivable_account_id AS interestReceivableAccountId,clearing_account_id AS clearingAccountId,interest_journal_id AS interestJournalId,source,request_key AS requestKey FROM loan_billing_opening_states WHERE ${admin}`).bind(actor),
  db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor),
 ])
 if(!permission.results.length)throw new Error('Unauthorized')
 return {states:states.results as {loanId:string;openingJournalId:string;rateBasisPoints:number;periodDays:number;cutoffRateBasisPoints:number|null;cutoffPeriodDays:30|60|180|null;interestDueMinor:string;recognizedInterestMinor:string;minimumAssessed:number;interestReceivableAccountId:string;clearingAccountId:string;interestJournalId:string|null;source:string;requestKey:string}[],loans:loans.results as {id:string;memberId:string;memberName:string;principalMinor:string;currency:string;openingDate:string}[],accounts:accounts.results as {id:string;code:string;name:string;currency:string}[],openings:openings.results as {loanId:string;journalId:string;principalMinor:string;currency:string;openingDate:string;receivableAccountId:string;clearingAccountId:string;source:string;createdBy:string;createdAt:string}[]}
}
export async function postLoanOpening(db:D1Database,actor:string|null,input:unknown){
 if(!actor||!(await db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor).first()))throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid input')
 const v=input as Record<string,unknown>,loanId=text(v.loanId),memberId=text(v.expectedMemberId),principal=text(v.expectedPrincipalMinor,16),currency=text(v.expectedCurrency,3),date=text(v.openingDate,10),original=text(v.expectedOriginalPrincipalMinor,16),disb=text(v.expectedDisbursementDate,10),receivable=text(v.receivableAccountId),clearing=text(v.clearingAccountId),source=text(v.source,450),key=text(v.requestKey)
 if(!/^(0|[1-9]\d*)$/.test(principal)||!Number.isSafeInteger(Number(principal))||!/^[A-Z]{3}$/.test(currency)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||! /^[1-9]\d*$/.test(original)||!Number.isSafeInteger(Number(original))||!/^\d{4}-\d{2}-\d{2}$/.test(disb)||!Number.isFinite(Date.parse(disb+'T00:00:00Z'))||new Date(disb+'T00:00:00Z').toISOString().slice(0,10)!==disb||receivable===clearing)throw new Error('Invalid opening')
 const find=()=>db.prepare(`SELECT loan_id AS loanId,journal_id AS journalId,member_id AS memberId,principal_minor AS principalMinor,currency,opening_date AS openingDate,reviewed_original_principal AS reviewedOriginalPrincipal,reviewed_disbursement_date AS reviewedDisbursementDate,receivable_account_id AS receivableAccountId,clearing_account_id AS clearingAccountId,source,created_by AS createdBy,request_key AS requestKey FROM loan_openings WHERE loan_id=? AND ${admin}`).bind(loanId,actor).first<Opening>()
 const verify=(o:Opening)=>{if(o.memberId!==memberId||String(o.principalMinor)!==principal||o.currency!==currency||o.openingDate!==date||String(o.reviewedOriginalPrincipal)!==original||o.reviewedDisbursementDate!==disb||o.receivableAccountId!==receivable||o.clearingAccountId!==clearing||o.source!==source||o.createdBy!==actor||o.requestKey!==key)throw new Error('Opening already recorded with different details');return {id:o.journalId}}
 let existing=await find();if(existing)return verify(existing)
 const journalId=crypto.randomUUID(),value=Number(principal)
 const statements=[db.prepare('INSERT INTO loan_openings(loan_id,journal_id,member_id,principal_minor,currency,opening_date,reviewed_original_principal,reviewed_disbursement_date,receivable_account_id,clearing_account_id,source,created_by,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(loanId,journalId,memberId,value,currency,date,Number(original),disb,receivable,clearing,source,actor,key)]
 // A zero principal opening is a reviewed record only; no zero-value journal exists.
 if(value>0)statements.push(
  db.prepare('INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by) VALUES(?,?,?,?,?,?,?)').bind(journalId,currency,date,`Brought-forward loan ${loanId}`, 'loan-opening',journalId,actor),
  db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),journalId,receivable,'debit',value),
  db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),journalId,clearing,'credit',value),
  db.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").bind(journalId),
 )
 try {await db.batch(statements)}catch(e){existing=await find();if(!existing)throw e}
 existing=await find();if(!existing)throw new Error('Opening not confirmed');return verify(existing)
}

/** Exact same-date reversal of the opening. The operator confirms the period is open. */
export async function correctLoanOpening(db:D1Database,actor:string|null,input:unknown){
 if(!actor||!(await db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor).first()))throw new Error('Unauthorized')
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid input')
 const v=input as Record<string,unknown>,loanId=text(v.loanId),expectedJournalId=text(v.expectedJournalId),reason=text(v.reason,450),key=text(v.requestKey)
 if(v.periodOpenConfirmed!==true)throw new Error('Confirm the original accounting period is open')
 type Correction={id:string;loanId:string;originalJournalId:string;reversalJournalId:string|null;reason:string;createdBy:string;status:string}
 const find=()=>db.prepare(`SELECT id,loan_id AS loanId,original_journal_id AS originalJournalId,reversal_journal_id AS reversalJournalId,reason,created_by AS createdBy,status FROM loan_opening_corrections WHERE request_key=? AND ${admin}`).bind(key,actor).first<Correction>()
 const verify=(c:Correction)=>{if(c.loanId!==loanId||c.originalJournalId!==expectedJournalId||c.reason!==reason||c.createdBy!==actor||c.status!=='final')throw new Error('Correction key already used');return {id:c.id,reversalId:c.reversalJournalId}}
 let existing=await find();if(existing)return verify(existing)
 const opening=await db.prepare(`SELECT loan_id AS loanId,journal_id AS journalId,member_id AS memberId,principal_minor AS principalMinor,currency,opening_date AS openingDate,reviewed_original_principal AS reviewedOriginalPrincipal,reviewed_disbursement_date AS reviewedDisbursementDate,receivable_account_id AS receivableAccountId,clearing_account_id AS clearingAccountId,source,created_by AS createdBy,request_key AS requestKey FROM loan_openings WHERE loan_id=? AND ${admin}`).bind(loanId,actor).first<Opening>()
 if(!opening||opening.journalId!==expectedJournalId)throw new Error('Opening changed; review again')
 const id=crypto.randomUUID(),reversalId=opening.principalMinor>0?crypto.randomUUID():null
 const statements=[db.prepare('INSERT INTO loan_opening_corrections(id,loan_id,original_journal_id,original_request_key,original_details,reversal_journal_id,reason,request_key,created_by,period_open_confirmed) VALUES(?,?,?,?,?,?,?,?,?,1)').bind(id,loanId,opening.journalId,opening.requestKey,JSON.stringify(opening),reversalId,reason,key,actor)]
 if(reversalId)statements.push(
  db.prepare('INSERT INTO journal_entries(id,currency,effective_date,description,source_type,source_id,created_by,reverses_entry_id) VALUES(?,?,?,?,?,?,?,?)').bind(reversalId,opening.currency,opening.openingDate,`Opening correction: ${reason}`,'loan-opening-reversal',id,actor,opening.journalId),
  db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),reversalId,opening.receivableAccountId,'credit',opening.principalMinor),
  db.prepare('INSERT INTO journal_lines(id,entry_id,account_id,side,amount_minor) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),reversalId,opening.clearingAccountId,'debit',opening.principalMinor),
  db.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").bind(reversalId),
 )
 statements.push(db.prepare("UPDATE loan_opening_corrections SET status='final' WHERE id=?").bind(id),db.prepare('DELETE FROM loan_openings WHERE loan_id=? AND journal_id=?').bind(loanId,opening.journalId))
 try{await db.batch(statements)}catch(e){existing=await find();if(!existing)throw e}
 existing=await find();if(!existing)throw new Error('Correction not confirmed');return verify(existing)
}
