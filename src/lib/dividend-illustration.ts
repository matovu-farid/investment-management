/** Illustrative amounts only. The applicable policy and income basis require review. */
export function dividendIllustration(value:string):{ips:string;board:string}{
 if(!/^(0|[1-9]\d{0,15})$/.test(value)||BigInt(value)>9007199254740991n)throw new Error('Enter a non-negative whole amount within the supported limit.')
 const amount=BigInt(value)
 return {ips:String(amount*30n/100n),board:String(amount*40n/100n)}
}
