/** Indicative 1.5% minimum, rounded up to the next whole minor unit. */
export function salaryPromiseGuide(issuedMinor:string,promisedMinor:string){
 const valid=(value:string)=>typeof value==='string'&&/^(0|[1-9]\d{0,29})$/.test(value)
 if(!valid(issuedMinor)||issuedMinor==='0'||!valid(promisedMinor))throw new Error('Enter whole non-negative amounts and a positive issued credit amount.')
 const minimum=(BigInt(issuedMinor)*15n+999n)/1000n
 return {minimumMinor:String(minimum),meetsMinimum:BigInt(promisedMinor)>=minimum}
}
