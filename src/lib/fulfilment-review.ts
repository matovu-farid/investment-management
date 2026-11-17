type Booking={memberId:string;currency:string;requestedMinor:number;fulfilledMinor?:number}
type Loan={id:string;memberId:string;currency:string;principalMinor:number;disbursementDate:string;voidedAt?:string|null}
type Fulfilment={loanId?:string|null;amountMinor:number;voidedAt?:string|null}
/** Early feedback only; the database checks authoritative records again at write time. */
export function fulfilmentReviewError({booking,loan,loanSelected,amountMinor,fulfilmentDate,fulfilments}:{booking:Booking;loan:Loan|null;loanSelected:boolean;amountMinor:number;fulfilmentDate:string;fulfilments:readonly Fulfilment[]}):string|null{
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)return 'Enter a positive whole fulfilment amount.'
 if(!Number.isSafeInteger(booking.requestedMinor)||!Number.isSafeInteger(booking.fulfilledMinor??0)||BigInt(amountMinor)>BigInt(booking.requestedMinor)-BigInt(booking.fulfilledMinor??0))return 'The amount exceeds the booking’s remaining recorded amount. Refresh and review it.'
 if(!loanSelected)return null
 if(!loan||loan.voidedAt||loan.memberId!==booking.memberId||loan.currency!==booking.currency||!Number.isSafeInteger(loan.principalMinor))return 'The selected loan is unavailable or does not match this booking. Refresh and review it.'
 if(!fulfilmentDate||fulfilmentDate<loan.disbursementDate)return 'The fulfilment date must be on or after the selected loan date.'
 let linked=0n
 for(const f of fulfilments)if(f.loanId===loan.id&&!f.voidedAt){if(!Number.isSafeInteger(f.amountMinor)||f.amountMinor<0)return 'The selected loan’s linked fulfilments need review.';linked+=BigInt(f.amountMinor)}
 if(BigInt(amountMinor)>BigInt(loan.principalMinor)-linked)return 'The amount exceeds the selected loan’s remaining unlinked principal. Refresh and review it.'
 return null
}
