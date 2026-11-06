export type Budget={id:string;category:string;periodStart:string;periodEnd:string;currency:string;amountMinor:string;source:string;createdBy:string;voidReason?:string|null;voidedBy?:string|null;voidedAt?:string|null}
export type Transaction={id:string;investment:string;transactionDate:string;type:string;currency:string;amountMinor:string;reference:string|null}
export type CashEntry={id:string;entryDate:string;direction:'receipt'|'payment';amountMinor:string;currency:string;counterparty:string;reference:string;description:string}
export type BudgetComparisonBasis='investment'|'cash_receipts'|'cash_payments'
export function parseBudgetComparisonBasis(value:unknown):BudgetComparisonBasis{
 if(value===undefined)return 'investment'
 if(value==='investment'||value==='cash_receipts'||value==='cash_payments')return value
 throw new Error('Invalid comparison basis')
}
/** Compares explicitly selected recorded positive amounts; not an accounting classification. */
export function calculateBudget(budget:Budget,transactions:Transaction[],ids:string[]){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new Error('Select distinct transactions')
 const selected=ids.map(id=>{const t=transactions.find(t=>t.id===id);if(!t||t.currency!==budget.currency||t.transactionDate<budget.periodStart||t.transactionDate>budget.periodEnd||!/^\d+$/.test(t.amountMinor))throw new Error('Invalid transaction selection');return t})
 if(!/^\d+$/.test(budget.amountMinor))throw new Error('Invalid budget amount')
 const total=selected.reduce((v,t)=>v+BigInt(t.amountMinor),0n)
 return {budget,selected,excluded:transactions.filter(t=>!ids.includes(t.id)),selectedTotal:String(total),difference:String(total-BigInt(budget.amountMinor))}
}

/** Cash facts stay separate from investment transactions. */
export function calculateCashSelection(budget:Budget,entries:CashEntry[],ids:string[]){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new Error('Select distinct cash records')
 const selected=ids.map(id=>{const e=entries.find(e=>e.id===id);if(!e||e.currency!==budget.currency||e.entryDate<budget.periodStart||e.entryDate>budget.periodEnd||!/^\d+$/.test(e.amountMinor)||(e.direction!=='receipt'&&e.direction!=='payment'))throw new Error('Invalid cash selection');return e})
 return {selected,excluded:entries.filter(e=>!ids.includes(e.id)),receiptsTotal:String(selected.filter(e=>e.direction==='receipt').reduce((sum,e)=>sum+BigInt(e.amountMinor),0n)),paymentsTotal:String(selected.filter(e=>e.direction==='payment').reduce((sum,e)=>sum+BigInt(e.amountMinor),0n))}
}

/** Use one explicitly selected source for the comparison; never combine overlapping records. */
export function calculateBudgetComparison(budget:Budget,transactions:Transaction[],transactionIds:string[],cashEntries:CashEntry[]|undefined,cashEntryIds:string[]|undefined,basis:unknown=undefined){
 const comparisonBasis=parseBudgetComparisonBasis(basis)
 if(cashEntryIds!==undefined&&!cashEntries)throw new Error('Cash records unavailable')
 if(comparisonBasis!=='investment'&&cashEntryIds===undefined)throw new Error('Cash selection required')
 const investment=calculateBudget(budget,transactions,transactionIds)
 const cash=cashEntryIds===undefined?undefined:calculateCashSelection(budget,cashEntries!,cashEntryIds)
 const selectedTotal=comparisonBasis==='cash_receipts'?cash!.receiptsTotal:comparisonBasis==='cash_payments'?cash!.paymentsTotal:investment.selectedTotal
 return {...investment,comparisonBasis,selectedTotal,difference:String(BigInt(selectedTotal)-BigInt(budget.amountMinor)),...(cash===undefined?{}:{cash})}
}
