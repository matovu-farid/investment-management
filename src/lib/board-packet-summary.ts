/** Only these fields may leave the server for summary-only access. */
export type BoardPacketSummary = {start:string;end:string;calculatedLending:{capturedFrom:string;capturedTo:string;data:{asOf:string;eligible:number;included:number;omitted:{unconfigured:number;pendingRepayments:number;unavailable:number};totals:{currency:string;principalMinor:string;interestMinor:string}[]}}}
export function boardPacketSummary(packet:unknown):BoardPacketSummary {
 const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Summary unavailable');return v as Record<string,unknown>}
 const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new Error('Invalid summary date');return v}
 const timestamp=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(v))throw new Error('Invalid summary capture time');return v}
 const count=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error('Invalid summary count');return v}
 const minor=(v:unknown)=>{if(typeof v!=='string'||!/^\d{1,100}$/.test(v))throw new Error('Invalid summary amount');return v}
 const p=object(packet), c=object(p.calculatedLending), d=object(c.data), o=object(d.omitted), start=date(p.start),end=date(p.end),asOf=date(d.asOf)
 if(start>end||end!==asOf||!Array.isArray(d.totals))throw new Error('Invalid summary period')
 const totals=d.totals.map(x=>{const t=object(x);if(typeof t.currency!=='string'||!/^[A-Z]{3}$/.test(t.currency))throw new Error('Invalid currency');return {currency:t.currency,principalMinor:minor(t.principalMinor),interestMinor:minor(t.interestMinor)}})
 const eligible=count(d.eligible),included=count(d.included),omitted={unconfigured:count(o.unconfigured),pendingRepayments:count(o.pendingRepayments),unavailable:count(o.unavailable)}
 if(eligible!==included+omitted.unconfigured+omitted.pendingRepayments+omitted.unavailable||new Set(totals.map(t=>t.currency)).size!==totals.length)throw new Error('Invalid summary coverage')
 return {start,end,calculatedLending:{capturedFrom:timestamp(c.capturedFrom),capturedTo:timestamp(c.capturedTo),data:{asOf,eligible,included,omitted,totals}}}
}

export function summaryCsv(s:BoardPacketSummary){
 const lines=[['Notice','Provisional calculation from current records; includes accrued but unposted interest. Not an approved statement. Small groups may reveal individual balances.'],['Capture UTC',s.calculatedLending.capturedFrom,s.calculatedLending.capturedTo],['Reporting period',s.start,s.end],['As of',s.calculatedLending.data.asOf],['Eligible loans',String(s.calculatedLending.data.eligible)],['Included loans',String(s.calculatedLending.data.included)],['Omitted: unconfigured',String(s.calculatedLending.data.omitted.unconfigured)],['Omitted: pending repayments',String(s.calculatedLending.data.omitted.pendingRepayments)],['Omitted: unavailable',String(s.calculatedLending.data.omitted.unavailable)],['Currency','Principal minor units','Accrued interest minor units'],...s.calculatedLending.data.totals.map(x=>[x.currency,x.principalMinor,x.interestMinor])]
 return lines.map(row=>row.map(x=>`"${x.replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n'
}
