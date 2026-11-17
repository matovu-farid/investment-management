import type {Fact} from '#/server/reports/service'
import {reportSections} from '#/lib/report-export/export'

/** Displays captured counts without forcing a wide table on smaller screens. */
export function CreditRequestTimingSummary({rows}:{rows:Fact[]}){
 const row=rows[0],columns=reportSections.find(section=>section.key==='bookingAgeSummary')!.columns
 if(!row)return <p>No summary captured.</p>
 return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{columns.map(([key,label])=><div key={key} className="rounded-md bg-muted/30 p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="ml-0 mt-1 text-xl font-semibold tabular-nums">{row[key]==null?'—':String(row[key])}</dd></div>)}</dl>
}
