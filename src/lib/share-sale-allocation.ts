export type InterestForAllocation = { id: string; date: string; shares: number }

/** The sale register does not link completed transfers to a request. */
export function reviewedSaleShares(value:string, requested:number):number {
 const available=Number(value)
 if(!Number.isSafeInteger(requested)||requested<=0||!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(available)||available>requested)throw new Error('Enter the reviewed available shares, from 1 up to the original request.')
 return available
}

/** A planning suggestion, not a share transfer or settlement. */
export function planSaleAllocation(shares: number, interests: InterestForAllocation[]) {
  if (!Number.isSafeInteger(shares) || shares <= 0) throw new Error('Invalid sale quantity')
  const ids = new Set<string>()
  for (const interest of interests) {
    const date = new Date(`${interest.date}T00:00:00.000Z`)
    if (!interest.id || ids.has(interest.id) || !Number.isSafeInteger(interest.shares) || interest.shares <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(interest.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== interest.date) throw new Error('Invalid interest selection')
    ids.add(interest.id)
  }
  let remaining = shares
  const rows = [...interests].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map(interest => {
    const allocated = Math.min(interest.shares, remaining)
    remaining -= allocated
    return {...interest, allocated}
  })
  return {rows, remaining}
}
