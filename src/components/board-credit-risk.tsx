import type {captureCreditRisk} from '../server/credit-risk/capture.ts'
import {creditEarlyWarning,creditEarlyWarningLabel} from '../lib/installment-tracking/early-warning.ts'
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from './ui/table'

type Profile=Awaited<ReturnType<typeof captureCreditRisk>>
const amount=(value:string)=>BigInt(value).toLocaleString('en-US')
const labels:Record<string,string>={smooth:'Smooth (no overdue as of date)',mild:'Mild risk',risky:'Risky','very-risky':'Very risky',review:'Requires review',unknown:'Unknown'}
export function CreditRiskPacketContent({profile}:{profile:Profile}){
 return <>
  <p>As of {profile.asOfDate}, {profile.currency}. Sources read from {profile.startedAt} to {profile.finishedAt} UTC, separately rather than as one atomic snapshot. The profile uses provisional principal plus accrued unpaid interest and latest reviewed schedules; it is not an approved historical score, a reconciled book, a recovery decision or a settlement quotation. Smooth means no overdue installment at the selected date; it does not establish consistently timely payments.</p>
  <p>{profile.includedCount} of {profile.eligibleCount} eligible loans included; {profile.unavailableLoanIds.length} require balance review. Included total: {amount(profile.totalMinor)} minor units; unknown and review-needed: {amount(profile.unclassifiedMinor)}.</p>
  <p>10% early-warning screen: {creditEarlyWarningLabel[creditEarlyWarning(profile)]} The policy denominator is unconfirmed; no credit decision is automated.</p>
  <p className="board-packet-scroll-hint text-sm text-muted-foreground">Scroll horizontally if needed to see all risk columns.</p>
  <Table containerProps={{tabIndex:0,role:"region", "aria-label":"Board credit risk table"}}><TableHeader><TableRow><TableHead scope="col">Risk</TableHead><TableHead scope="col">Loans</TableHead><TableHead scope="col">Amount (minor units)</TableHead><TableHead scope="col">Share (basis points)</TableHead></TableRow></TableHeader><TableBody>{profile.bands.map(b=><TableRow key={b.risk}><TableCell>{labels[b.risk] ?? b.risk}</TableCell><TableCell>{b.loanCount}</TableCell><TableCell>{b.amountMinor}</TableCell><TableCell>{b.basisPoints??'—'}</TableCell></TableRow>)}</TableBody></Table>
  {profile.unavailableLoanIds.length>0 && <p>Loans requiring balance review: {profile.unavailableLoanIds.join(', ')}.</p>}
 </>
}
