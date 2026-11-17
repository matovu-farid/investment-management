import { approvalGuidance } from '#/lib/approval-guidance'
import { Alert, AlertDescription } from '#/components/ui/alert'
export function ApprovalGuidance({currency,amount,date,kind}:{currency:string;amount:string;date:string;kind:'loan'|'investment'}){
 const guidance=approvalGuidance(currency,amount,date,kind)
 if(!guidance)return null
 return <Alert><AlertDescription><strong>IPS approval reference:</strong> {guidance.authority==='gm'?'Loans and investments up to UGX 50 million are assigned to the General Manager.':'Loans and investments above UGX 50 million are assigned to the General Manager and Board.'} {guidance.externalReview&&'For major external or non-traditional investments above UGX 300 million, the IPS also calls for Board recommendation and a member vote if required. '}The IPS states maximum approval periods of 5 days for the GM, 14 days for the Board and 60 days for shareholders; confirm the starting point and applicable process. Verify the applicable approval and evidence; recording this item does not grant or confirm approval.</AlertDescription></Alert>
}
