import { screenInvestmentConcentration } from '#/lib/allocation-concentration'

export function InvestmentConcentration({allocation}:{allocation:{asOf:string;total:string;selected:{investmentId:string;name:string;amountMinor:string}[]}}){
 const rows=screenInvestmentConcentration(allocation)
 return <section><h4>Individual investment concentration</h4><p>The 28 September 2025 policy sets a 45% single-investment ceiling. This screen is calculated when viewed from the selected records and compares each record with the selected total using exact amounts. Missing assets, overlapping records and investments split across records can change the result; this is not a compliance determination.</p>{rows===null?<p>The selected date precedes this policy; no comparison is shown.</p>:rows.length?<ul>{rows.map(row=><li key={row.investmentId}>{row.name} · {BigInt(row.basisPoints)/100n}.{String(BigInt(row.basisPoints)%100n).padStart(2,'0')}% · {row.comparison==='above'?'above 45% of selected total':'within 45% of selected total'}</li>)}</ul>:<p>No individual investment observations were selected.</p>}</section>
}
