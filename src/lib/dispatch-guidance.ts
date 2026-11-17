export type DispatchRoute=''|'equity'|'other-bank'|'mobile-money'|'cash'|'historical-unknown'
export type DispatchAdvice='route-needed'|'before-policy'|'cash-not-allowed'|'historical-not-allowed'|'mobile-cost'|'currency-review'|'no-charge'|'rtgs-estimate'|'boundary-review'
export const dispatchRouteLabel:Record<DispatchRoute,string>={
 '':'Not declared',equity:'Equity Bank','other-bank':'Other bank','mobile-money':'Mobile money',cash:'Physical cash','historical-unknown':'Unknown historical route',
}
/** Current protocol guidance only; this does not establish an actual transfer or fee. */
export function dispatchGuidance(currency:string,amountMinor:number,route:DispatchRoute,date:string):DispatchAdvice{
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('Invalid loan amount')
 if(!['','equity','other-bank','mobile-money','cash','historical-unknown'].includes(route))throw new Error('Invalid payment route')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new Error('Invalid disbursement date')
 if(!route)return 'route-needed'
 if(date<'2025-09-28')return 'before-policy'
 if(route==='cash')return 'cash-not-allowed'
 if(route==='historical-unknown')return 'historical-not-allowed'
 if(currency!=='UGX')return 'currency-review'
 if(route==='mobile-money')return 'mobile-cost'
 if(route==='equity'||amountMinor>10000000)return 'no-charge'
 if(amountMinor===10000000)return 'boundary-review'
 return 'rtgs-estimate'
}
export const dispatchAdviceLabel:Record<DispatchAdvice,string>={
 'route-needed':'Select a route for an indicative protocol check.',
 'before-policy':'The disbursement predates the current 28 September 2025 protocol version. Review the terms applicable on that date.',
 'cash-not-allowed':'The current protocol says cash dispatch is unacceptable.',
 'historical-not-allowed':'An unknown route can only be declared for an earlier historical disbursement.',
 'mobile-cost':'The protocol says to pass mobile-money costs to the member and also describes no charge above UGX 10 million. Confirm how those rules interact and verify the actual charge.',
 'currency-review':'The protocol describes charges in UGX; review the route and actual charge for this currency.',
 'no-charge':'The protocol describes no dispatch charge for this route and amount; verify the actual transfer.',
 'rtgs-estimate':'The protocol says the RTGS cost is passed to the member and quoted UGX 10,000 at the time. Verify the current charge.',
 'boundary-review':'The protocol does not specify the exact UGX 10 million boundary. Confirm the charge before dispatch.',
}
