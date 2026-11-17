const DAY=86_400_000
function parseDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Enter valid calendar dates.')
 const time=Date.parse(`${value}T00:00:00Z`)
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new Error('Enter valid calendar dates.')
 return time
}
/** Illustration only: each period starts on the reviewer-selected date. */
export function illustrateApprovalPeriods(start:string,asOf:string){
 const initial=parseDate(start),current=parseDate(asOf)
 if(start<'2025-09-28')throw new Error('Start date must be on or after 28 September 2025.')
 return ([['General Manager',5],['Board',14],['Shareholders',60]] as const).map(([role,days])=>{
  const due=new Date(initial+days*DAY),date=due.toISOString().slice(0,10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Start date is too late to calculate dates.')
  const status=current<initial?'not started':current<due.getTime()?'upcoming':current===due.getTime()?'due today':'date passed'
  return {role,days,date,status}
 })
}
