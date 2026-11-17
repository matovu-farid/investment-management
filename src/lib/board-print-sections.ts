/** Accordion sections that must be materialized in the print-only copy. */
export function boardPrintSections(packet:{creditRisk?:unknown;sales?:unknown;calculatedLending?:unknown;allocation?:unknown;combinedAllocation?:unknown;statements?:unknown[];budgets?:unknown}){
 return ['activity','lending','trial',...(packet.creditRisk?['credit-risk']:[]),...(packet.sales?['sales']:[]),...(packet.calculatedLending?['calculated-lending']:[]),...(packet.allocation?['allocation']:[]),...(packet.combinedAllocation?['combined-allocation']:[]),...(packet.statements??[]).map((_,i)=>`statement-${i}`),...(packet.budgets?['budgets']:[])]
}
