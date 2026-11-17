import { equityConflictingCompanies, equitySimilarLabels } from '../equity-concentration.ts'
import { turboSummary } from '../turbo-summary.ts'
import type { reviewPortfolioAllocation } from '../../server/allocation/portfolio-review.ts'
import { csvCell } from '../report-export/export.ts'
import { allocationCsv } from './export.ts'
type Review = Awaited<ReturnType<typeof reviewPortfolioAllocation>>

export function combinedAllocationCsv(review:Review):string {
 const rows:(string|number|null|undefined)[][]=[
  [],['Combined source evidence'],
  ['Overlap reviewed','Yes; the reviewer is responsible for identifying duplicated assets.'],
  ['Capture limitation','Sources are captured at different times; this is not an atomic or historical snapshot.'],
  ['Investment capture from (UTC)',review.investmentSnapshotFrom],['Investment capture to (UTC)',review.investmentSnapshotTo],
  ['Cash and lending capture from (UTC)',review.sources.capturedFrom ?? 'Not recorded in this draft'],['Cash and lending capture to (UTC)',review.sources.capturedTo ?? 'Not recorded in this draft'],
  ['Selected cash accounts'],['Account ID','Code','Account','Currency','Debits','Credits','Net debit'],
  ...review.sources.cash.map(a=>[a.accountId,a.code,a.name,a.currency,a.debits,a.credits,a.netDebit]),
  ['Lending included',review.sources.lending?'Yes':'No'],
 ]
 if(review.equityReview)rows.push(['Quoted-equity concentration'],['Basis','Explicitly classified equity subtotal; denominator and classifications require review. Names are grouped exactly.'],['Companies assigned to multiple sectors',equityConflictingCompanies(review.equityReview.positions).join(', ')||'None detected'],['Similar company labels counted separately',equitySimilarLabels(review.equityReview.positions).companies.map(group=>group.join(' / ')).join('; ')||'None detected'],['Similar sector labels counted separately',equitySimilarLabels(review.equityReview.positions).sectors.map(group=>group.join(' / ')).join('; ')||'None detected'],['Classified equity subtotal',review.equityReview.totalMinor],['Investment ID','Investment','Company','Sector','Amount (minor units)'],...review.equityReview.positions.map(p=>[p.investmentId,p.name,p.company,p.sector,p.amountMinor]),['Company','Amount (minor units)','Basis points','25% maximum'],...review.equityReview.companies.map(g=>[g.name,g.amountMinor,g.basisPoints,g.comparison]),['Sector','Amount (minor units)','Basis points','40% maximum'],...review.equityReview.sectors.map(g=>[g.name,g.amountMinor,g.basisPoints,g.comparison]))
 if(review.turboReview){const summary=turboSummary(review.turboReview.deals,review.allocation.total);rows.push(['Turbo marked total (minor units)',summary.totalMinor],['Turbo total (basis points, rounded)',summary.totalBasisPoints],['20% fund cap comparison',summary.totalComparison]);rows.push(['Turbo review · HIGH RISK'],['Basis','Fund total calculated at export from reviewer-marked deals. Compare against selected total; missing or overlapping assets and split deals change the result. An investment memo is required but not verified.'],['Investment ID','Investment','Risk','Memo reference (not verified)','Amount (minor units)','Allocation (basis points, rounded)','Comparison with 10% selected total'],...review.turboReview.deals.map(d=>[d.investmentId,d.name,'HIGH RISK',d.memoReference??'Not recorded',d.amountMinor,d.basisPoints,d.comparison]))}
 if(review.liquidity)rows.push(['Selected-source liquidity review'],['Basis','Reviewer-selected liquid or near-liquid sources; selected subset only, not compliance.'],['Liquid amount (minor units)',review.liquidity.amountMinor],['Liquidity (basis points, rounded)',review.liquidity.basisPoints],['10% minimum comparison',review.liquidity.comparison],['Liquid investment ID'],...review.liquidity.investmentIds.map(id=>[id]),['Liquid cash account ID'],...review.liquidity.cashAccountIds.map(id=>[id]))
 const lending=review.sources.lending
 if(lending)rows.push(['Lending basis','Provisional principal and accrued unpaid interest; amounts may not be posted.'],['Eligible loans',lending.eligible],['Included loans',lending.included],['Unconfigured',lending.omitted.unconfigured],['Pending repayments',lending.omitted.pendingRepayments],['Unavailable',lending.omitted.unavailable],['Currency','Principal','Unpaid interest'],...lending.totals.map(t=>[t.currency,t.principalMinor,t.interestMinor]))
 return allocationCsv(review.allocation,true)+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
