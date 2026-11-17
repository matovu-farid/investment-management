import { creditEarlyWarning, creditEarlyWarningLabel } from './early-warning.ts'
import type { captureCreditRisk } from '../../server/credit-risk/capture.ts'
import { csvCell } from '../report-export/export.ts'
type Profile=Awaited<ReturnType<typeof captureCreditRisk>>
const labels:Record<string,string>={smooth:'Smooth (no overdue as of date)',mild:'Mild risk',risky:'Risky','very-risky':'Very risky',review:'Requires review',unknown:'Unknown'}

export function creditRiskCsv(profile:Profile){
 if(profile.offset!==0||profile.nextOffset!==null||profile.eligibleCount!==profile.totalEligible||profile.includedCount+profile.unavailableLoanIds.length!==profile.eligibleCount)throw new Error('Cannot export an incomplete risk profile')
 const rows:(string|number|null)[][]=[
  ['RNIG provisional credit-book risk profile'],['As of',profile.asOfDate],['Currency',profile.currency],
  ['Basis','Calculated principal plus accrued unpaid interest in minor units.'],
  ['Limitations','Latest reviewed schedules and current records; not an approved historical score. Smooth means no overdue installment at the selected date; it does not establish consistently timely payments. Not a complete reconciled book, recovery decision or settlement quotation.'],
  ['Capture window UTC',profile.startedAt,profile.finishedAt],['Eligible loans',profile.eligibleCount],['Included loans',profile.includedCount],['Balance unavailable',profile.unavailableLoanIds.length],['Included total',profile.totalMinor],['Unknown and review-needed',profile.unclassifiedMinor],
  ['10% early-warning screen',creditEarlyWarningLabel[creditEarlyWarning(profile)]],
  ['Warning basis','Provisional principal plus accrued unpaid interest; policy denominator is unconfirmed. No automatic credit decision.'],
  ['Risk','Loans','Amount (minor units)','Share (basis points)'],
  ...profile.bands.map(b=>[labels[b.risk],b.loanCount,b.amountMinor,b.basisPoints]),
  ['Loans needing balance review'],...profile.unavailableLoanIds.map(id=>[id]),
 ]
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
