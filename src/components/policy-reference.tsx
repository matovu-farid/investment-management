import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

const ranges = [
  ['Kanungu member credit', '35–45%', '10%'],
  ['Quoted equities', '25–45%', '12%'],
  ['Government long-term securities (bonds)', '10–25%', '14%'],
  ['Short-term instruments', '5–15%', '11%'],
  ['Turbo private equity fund', '10–20%', '20%'],
  ['Real estate', '0% · new activity on hold', 'Not stated'],
]

export function PolicyReference() {
  return <Card className="mt-6"><CardHeader><CardTitle>Current investment policy reference</CardTitle><CardDescription>Investment Policy Statement approved 28 September 2025, printed pages 6–9. The ranges below are a reference. Check the recorded ranges and their sources before using them in an allocation review.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <Table className="table-fixed"><TableHeader><TableRow><TableHead className="w-[44%] whitespace-normal">Asset class</TableHead><TableHead className="w-[24%] whitespace-normal">Policy range</TableHead><TableHead className="w-[32%] whitespace-normal">Minimum expected annual return</TableHead></TableRow></TableHeader><TableBody>{ranges.map(([name, range, expectedReturn]) => <TableRow key={name}><TableCell className="whitespace-normal">{name}</TableCell><TableCell className="whitespace-normal">{range}</TableCell><TableCell className="whitespace-normal">{expectedReturn}</TableCell></TableRow>)}</TableBody></Table>
    <p>The expected returns are IPS reference figures, not actual performance or guaranteed returns. The app does not calculate or assess them here.</p>
    <p>The IPS also sets Operation 2030 objectives: a UGX 4 billion portfolio by 2030 and a minimum annual portfolio return of 15% net of fees over a rolling six-year period. It also calls for meeting all member credit requests within 30 calendar days. These are policy objectives, not calculated results; the current records do not by themselves establish a complete portfolio or a reconciled return series. <strong>Source:</strong> Investment Policy Statement, p. 5.</p>
    <p>The policy defines allocation as a percentage of the total portfolio, including member credit. It also calls for at least 10% liquidity, a maximum of 45% in one investment, and quadrimester monitoring. Valuations, classifications and portfolio completeness must be reviewed before drawing compliance conclusions.</p>
    <p>The IPS says the Equity Bank account should hold UGX 1 million or less and describes using money market funds as a liquidity buffer. This is a policy reference, not a balance check: confirm the relevant account and operational needs before acting. <strong>Source:</strong> Investment Policy Statement, p. 7.</p>
    <p>For quoted equities, the policy calls for a maximum of 40% in one sector and 25% in one company. The optional combined review uses explicitly entered classifications and the selected equity subtotal as a provisional denominator; confirm both before relying on the result.</p>
    <p>For the Turbo private equity fund, the policy caps each deal at 10% of total assets and describes a normal deal size of 1–5%. It calls for Turbo investments to be labeled high risk in reports and preceded by an investment memo covering expected returns, risks and estimated timelines. The combined allocation review lets an administrator mark Turbo deals explicitly; the app does not infer classifications or verify the memo.</p>
    <p>Early-warning triggers include a 20% or greater dip in equity value for review, and member-loan delinquency of 10% classified as Very Risky for credit-tightening review. The investment register offers a manual two-valuation equity review. These references do not automatically enforce the triggers.</p>
    <p>The policy assigns loans and investments up to UGX 50 million to the GM and those above that amount to the GM and Board. Major external or non-traditional investments above UGX 300 million require a Board recommendation and a member vote if required. The IPS states maximum approval periods of 5 days for the GM, 14 days for the Board and 60 days for shareholders; the starting point and whether days are calendar or working days need confirmation.</p>
  </CardContent></Card>
}
