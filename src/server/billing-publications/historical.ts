import { calculateLoanBilling } from '../../lib/loan-billing/billing.ts'
import { calculateOpeningLoanBilling } from '../../lib/loan-billing/opening.ts'
import { listLoanBilling } from '../loan-billing/service.ts'

/** Calculate using current records through a past date; this does not authorize posting. */
export async function historicalBalance(db:D1Database,actor:string,loanId:string,asOfDate:string,snapshot?:Awaited<ReturnType<typeof listLoanBilling>>){
 const data=snapshot??await listLoanBilling(db,actor),loan=data.loans.find(x=>x.id===loanId),config=data.configs.find(x=>x.loanId===loanId),revision=data.revisions.find(x=>x.loanId===loanId)
 if(!loan||!config||!revision)throw new Error('Loan billing setup not found')
 if(data.legacyReviews.some(r=>r.configRequestKey===config.requestKey&&!r.valid))throw new Error('Legacy review incomplete')
 const opening=data.openings.find(x=>x.loanId===loanId)
 if(opening&&(opening.cutoffRateBasisPoints===null||opening.cutoffPeriodDays===null))throw new Error('Opening cutoff rate must be reviewed')
 const payments=data.repayments.filter(x=>x.loanId===loanId&&!x.voided&&x.date<=asOfDate)
 const events=data.events.filter(x=>x.loanId===loanId&&x.repaymentId&&x.eventDate<=asOfDate)
 if(payments.some(p=>!events.some(e=>e.repaymentId===p.id&&e.repaymentJournalId)))throw new Error('Finalize earlier recorded repayments first')
 const journals=await db.prepare(`SELECT e.id FROM loan_billing_events e JOIN journal_entries j ON j.id=e.repayment_journal_id AND j.status='posted' WHERE e.loan_id=? AND e.event_date<=? AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=e.id AND v.status='final') AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id=j.id AND x.status='posted') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')`).bind(loanId,asOfDate,actor).all<{id:string}>()
 if(payments.some(p=>!events.some(e=>e.repaymentId===p.id&&journals.results.some(j=>j.id===e.id))))throw new Error('Repayment journal unavailable or reversed')
 const repayments=payments.map(p=>({id:p.id,date:p.date,amountMinor:p.amountMinor})),rateChanges=data.rateChanges.filter(c=>c.loanId===loanId&&!c.voidedAt).map(c=>({effectiveDate:c.effectiveDate,rateBasisPoints:c.rateBasisPoints,periodDays:c.periodDays}))
 const result=opening?calculateOpeningLoanBilling({originalPrincipalMinor:config.principalMinor,disbursementDate:config.disbursementDate,openingDate:opening.openingDate,openingPrincipalMinor:opening.principalMinor,openingInterestDueMinor:opening.interestDueMinor,openingRecognizedInterestMinor:opening.recognizedInterestMinor,minimumAssessed:!!opening.minimumAssessed,asOfDate,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,cutoffRateBasisPoints:opening.cutoffRateBasisPoints!,cutoffPeriodDays:opening.cutoffPeriodDays!,repayments,rateChanges}):calculateLoanBilling({principalMinor:config.principalMinor,disbursementDate:config.disbursementDate,asOfDate,rateBasisPoints:config.rateBasisPoints,periodDays:config.periodDays,repayments,rateChanges})
 for(const payment of payments){const line=result.lines.find(x=>x.type==='payment'&&x.paymentId===payment.id),event=events.find(e=>e.repaymentId===payment.id);if(!line||!event||line.principalMinor!==event.principalMinor||line.interestMinor!==event.interestMinor||line.unappliedMinor!==event.unappliedMinor)throw new Error('Posted allocation differs from current billing')}
 if(!snapshot){const after=await listLoanBilling(db,actor);if(after.revisions.find(r=>r.loanId===loanId)?.revision!==revision.revision)throw new Error('Billing changed; review again')}
 return {result,revision:revision.revision}
}
