export const creditRequestFields=[['purpose','Purpose of funds'],['repaymentPromise','Repayment promise'],['interestOption','Requested interest option'],['duration','Requested credit duration'],['receivingAccount','Preferred receiving account']] as const
export type CreditRequestFields=Record<(typeof creditRequestFields)[number][0],string>
export function missingCreditRequestFields(details:CreditRequestFields):string[]{return creditRequestFields.filter(([key])=>!details[key].trim()).map(([,label])=>label)}
export function creditRequestChanged(saved:CreditRequestFields,draft:CreditRequestFields):boolean{return creditRequestFields.some(([key])=>saved[key]!==draft[key])}
