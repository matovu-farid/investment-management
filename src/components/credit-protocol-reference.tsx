import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'

// This is a dated source reference, not a policy engine or approval decision.
export function CreditProtocolReference() {
  return <Card className="mt-6">
    <CardHeader><CardTitle>Credit protocol reference</CardTitle></CardHeader>
    <CardContent>
      <Alert><AlertDescription>The current credit protocol and IPS are dated 28 September 2025. This reference supports review; it does not approve credit or calculate interest, capacity, arrears or risk.</AlertDescription></Alert>
      <Accordion type="multiple" className="mt-4">
        <AccordionItem value="request"><AccordionTrigger>Request and assessment</AccordionTrigger><AccordionContent>
          <p>The 2025 protocol asks for the amount, purpose, repayment promise, interest option, duration and preferred account. It prohibits credit to non-members and borrowing on behalf of outsiders. The GM reviews the credit limit, history, purpose and repayment promise. <strong>Source:</strong> Credit Dispatch Protocol, p. 1.</p>
          <p>For independent directors, the protocol states a UGX 5 million credit limit. For consumption borrowing, it says dispatch should remain within the member's shareholding or credit limit; for wealth-generating purposes, it asks the GM to consider the expected return against the cost of credit. <strong>Source:</strong> Credit Dispatch Protocol, p. 1.</p>
          <p>For salaried borrowers, the processing section describes a monthly repayment promise of at least 1.5% of issued credit. For business or investment borrowers it describes lump sums linked to milestones. The risk table separately refers to 5% of outstanding for salaried borrowers, so the applicable treatment requires review. <strong>Source:</strong> Credit Dispatch Protocol, pp. 1, 4.</p>
          <p>For a first-time borrower, the protocol limits credit to 50% of shareholding worth. For credit above the limit, it requires collateral deposited with the RNIG lawyer and states a 2% charge per 30 days on a reducing balance. Confirm whether that rate applies only to the excess, and confirm the valuation, limit, allocation and calculation details. <strong>Source:</strong> Credit Dispatch Protocol, p. 2.</p>
        </AccordionContent></AccordionItem>
        <AccordionItem value="terms"><AccordionTrigger>Terms and dispatch</AccordionTrigger><AccordionContent>
          <p>The protocol describes 2% for 60 days or 5% for 180 days on a reducing balance, a 60-day grace period and a common billing day on the 27th. It describes an initial prorated period, but does not fully specify day count, rounding, payment allocation or every date boundary. Do not calculate from this summary. <strong>Source:</strong> Credit Dispatch Protocol, pp. 1–2.</p>
          <p>Members may run credit for periods of 36 months if they meet their obligations. The protocol states that at least 60 days of interest is billed and gives a 60-day grace period before repayment promises start. <strong>Source:</strong> Credit Dispatch Protocol, pp. 1–2.</p>
          <p>Cash dispatch is unacceptable under the protocol. It describes no dispatch charge for Equity Bank or amounts above UGX 10 million, passing on RTGS costs for transfers below UGX 10 million to other banks, and passing on mobile-money costs. The document quotes a UGX 10,000 RTGS cost at the time; verify current charges and the treatment of exactly UGX 10 million before dispatch. <strong>Source:</strong> Credit Dispatch Protocol, p. 2.</p>
        </AccordionContent></AccordionItem>
        <AccordionItem value="oversight"><AccordionTrigger>Oversight and risk</AccordionTrigger><AccordionContent>
          <p>The IPS assigns loans and investments up to UGX 50 million to the GM and those above UGX 50 million to the GM and Board. Major external or non-traditional investments over UGX 300 million require Board recommendation and a member vote if required. Review the approvals for this request. <strong>Source:</strong> Nattabi &amp; Amiri Investment Policy Statement, p. 9.</p>
          <p>The credit protocol states there are no penalties or fines and describes freezing debt after six months of non-payment and triggering a write-off process. It describes possible credit bans of six months to two years. These are references for human review, not automatic default or write-off decisions. <strong>Source:</strong> Credit Dispatch Protocol, p. 4.</p>
          <p>The protocol describes four risk categories: smooth for consistent on-time payment, mild risk for delayed payment within 90 days, risky for delayed payment within 180 days, and very risky for more than six months without payment. The installment worksheet derives a provisional current-position indicator from the reviewed schedule and recorded payments. Review the source history and category boundaries before making a credit decision; this indicator is not an approved historical credit score. <strong>Source:</strong> Credit Dispatch Protocol, p. 4.</p>
        </AccordionContent></AccordionItem>
      </Accordion>
    </CardContent>
  </Card>
}
