import {creditRiskCsv} from './installment-tracking/risk-export.ts'
import { csvCell, reportCsv } from './report-export/export.ts'
import { trialBalanceCsv } from './trial-balance-export/export.ts'
import { allocationCsv } from './allocation-export/export.ts'
import { combinedAllocationCsv } from './allocation-export/combined.ts'
import { budgetComparisonCsv } from './budget-export/export.ts'
import type { Packet } from '../server/board-packets/service.ts'

/** Combine the reviewed sections without recomputing their contents or implying a shared capture time. */
export function boardPacketCsv(packet: Packet): string {
  const row = (...fields: string[]) => fields.map(csvCell).join(',')
  const capture = (label: string, section: {capturedFrom:string;capturedTo:string}) => row(label, `Captured from ${section.capturedFrom} to ${section.capturedTo} UTC`)
  const contents = [row('RNIG board-pack draft'), row('Period start', packet.start), row('Period end', packet.end), row('Sections were captured independently. Changes after capture are not included; regenerate a preview for newer records. This draft is not published or approved.'), ...packet.omissions.map(o => row('Omitted', o)), '', capture('Recorded activity', packet.activity), reportCsv(packet.activity.data).replace(/^\ufeff/, ''), '', capture('Lending snapshot', packet.lending), packet.lending.data.csv.replace(/^\ufeff/, ''), '', capture('Trial balance', packet.trialBalance), trialBalanceCsv(packet.trialBalance.data).replace(/^\ufeff/, '')].join('\r\n')
  const extras: string[] = []
  if (packet.creditRisk) extras.push('', row('Credit-book risk profile'), creditRiskCsv(packet.creditRisk).replace(/^\ufeff/, ''))
  if (packet.calculatedLending) { const d=packet.calculatedLending.data;extras.push('',capture('Provisional calculated lending totals',packet.calculatedLending),row('As of',d.asOf),row('Provisional historical estimates based on current records; accrued interest may not be posted. Not settlement quotations.'),row('Eligible',String(d.eligible),'Included',String(d.included),'Omitted: unconfigured',String(d.omitted.unconfigured),'Omitted: pending repayments',String(d.omitted.pendingRepayments),'Omitted: unavailable',String(d.omitted.unavailable)),row('Currency','Principal minor units','Accrued unpaid interest minor units'),...d.totals.map(t=>row(t.currency,t.principalMinor,t.interestMinor))) }
  if (packet.allocation) extras.push('', capture('Allocation comparison', packet.allocation), allocationCsv(packet.allocation.data).replace(/^\ufeff/, ''))
  if (packet.combinedAllocation) extras.push('', capture('Combined selected-source allocation', packet.combinedAllocation), combinedAllocationCsv(packet.combinedAllocation.data).replace(/^\ufeff/, ''))
  if (packet.budgets) for (const [i, comparison] of packet.budgets.data.entries()) extras.push('', capture(`Budget comparison ${i + 1}`, packet.budgets), budgetComparisonCsv(comparison).replace(/^\ufeff/, ''))
  if (packet.statements) for (const [i, statement] of packet.statements.entries()) extras.push('', capture(`Statement working paper ${i + 1}`, statement), statement.data.csv.replace(/^\ufeff/, ''))
  if (packet.sales) {
    const d = packet.sales.data
    extras.push('', capture('Share-sale requests', packet.sales), row(`Requests and events dated through ${packet.end}; names are current at capture. Later backdated records may be included. No allocation, approval, payment or ownership transfer is inferred.`),
      row('Sale ID','Seller member ID','Seller name','Member number','Shares','Asking price (minor units)','Currency','Request date','Deadline','Notes'),
      ...d.requests.map(r=>row(r.id,r.memberId,r.memberName,r.memberNumber,String(r.shares),String(r.askingPriceMinor),r.currency,r.requestDate,r.deadlineDate??'',r.notes??'')),
      row('Interest ID','Sale ID','Member ID','Member name','Member number','Interest date','Shares','Notes','Provenance'),
      ...d.interests.map(i=>row(i.id,i.saleId,i.memberId,i.memberName,i.memberNumber,i.interestDate,String(i.shares),i.notes??'',i.provenance??'Not recorded')), 
      row('Status event ID','Sale ID','Date','Status','New deadline','Notes'),
      ...d.statuses.map(e=>row(e.id,e.saleId,e.statusDate,e.status,e.newDeadlineDate??'',e.notes??'')))
  }
  return '\ufeff' + [contents, ...extras].join('\r\n')
}
