import type {listLoanBilling} from './service.ts'
import type {calculateLoanBilling} from '../../lib/loan-billing/billing.ts'
type Data=Awaited<ReturnType<typeof listLoanBilling>>
export function repaymentsMatchLedger(payments:Data['repayments'], events:Data['events'], lines:ReturnType<typeof calculateLoanBilling>['lines'], validJournals:Set<string>){
 return payments.every(payment=>{const event=events.find(e=>e.repaymentId===payment.id),line=lines.find(x=>x.type==='payment'&&x.paymentId===payment.id);return !!event&&!!event.repaymentJournalId&&validJournals.has(event.id)&&!!line&&line.principalMinor===event.principalMinor&&line.interestMinor===event.interestMinor&&line.unappliedMinor===event.unappliedMinor})
}
export async function validRepaymentJournals(db:D1Database,actor:string|null,asOf:string){
 const r=await db.prepare(`SELECT e.id FROM loan_billing_events e JOIN journal_entries j ON j.id=e.repayment_journal_id AND j.status='posted' WHERE e.event_date<=? AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=e.id AND v.status='final') AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id=j.id AND x.status='posted') AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY e.id`).bind(asOf,actor).all<{id:string}>()
 return r.results.map(x=>x.id)
}
