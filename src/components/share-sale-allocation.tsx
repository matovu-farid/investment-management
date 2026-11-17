import { Checkbox } from "#/components/ui/checkbox.tsx"
import { useId, useState } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { planSaleAllocation, reviewedSaleShares } from '#/lib/share-sale-allocation'

type Interest = {id:string;memberName:string;interestDate:string;shares:number}

export function ShareSaleAllocation({shares,interests}:{shares:number;interests:Interest[]}) {
  const id=useId()
  const [availableInput,setAvailableInput]=useState('')
  const [selected,setSelected]=useState<string[]>([])
  const [show,setShow]=useState(false)
  const chosen=interests.filter(i=>selected.includes(i.id))
  let available:number|null=null
  try { available=reviewedSaleShares(availableInput,shares) } catch {}
  const result=show && chosen.length && available!==null ? planSaleAllocation(available,chosen.map(i=>({id:i.id,date:i.interestDate,shares:i.shares}))) : null
  return <section className="mt-6"><h4>Plan a possible allocation</h4><Alert><AlertDescription>This provisional first-come plan uses only the interest records you select. Earlier dates come first; same-day records are ordered by ID because time of receipt is not recorded. The last fill may be partial. Verify eligibility, withdrawals, deadlines and priority before approval. Completed transfers are not linked to this request, so check them and enter how many shares remain available. This does not reserve shares, approve a sale, record payment or transfer ownership.</AlertDescription></Alert>
    <p className="mt-4">Original request: {shares.toLocaleString('en-US')} shares.</p><label htmlFor={`${id}-available`} className="block">Reviewed shares still available</label><Input id={`${id}-available`} type="text" inputMode="numeric" value={availableInput} onChange={e=>{setAvailableInput(e.target.value);setShow(false)}} aria-invalid={!!availableInput&&available===null} aria-describedby={`${id}-available-help`}/><p id={`${id}-available-help`}>Enter a whole number from 1 to the original request after checking completed transfers. Leave blank if availability is unknown.</p>{!!availableInput&&available===null&&<Alert variant="destructive"><AlertDescription>Enter a valid reviewed quantity within the original request.</AlertDescription></Alert>}
    {interests.length===0 ? <p>No interest records are available.</p> : <><fieldset className="mt-4 flex flex-col gap-2"><legend>Select interest to include</legend>{interests.map(i=><label key={i.id} className="flex items-center gap-2"><Checkbox checked={selected.includes(i.id)} onCheckedChange={nextChecked=>{const checked=(nextChecked===true);setSelected(old=>checked?[...old,i.id]:old.filter(x=>x!==i.id));setShow(false)}} />{i.interestDate} · {i.memberName} · {i.shares.toLocaleString('en-US')} shares · {i.id}</label>)}</fieldset><Button type="button" variant="outline" className="mt-4" disabled={!chosen.length||available===null} onClick={()=>setShow(true)}>Calculate provisional plan</Button></>}
    {result && <><p>Plan based on {available!.toLocaleString('en-US')} reviewed available shares.</p><Table><TableHeader><TableRow><TableHead>Interest date</TableHead><TableHead>Member</TableHead><TableHead>Requested</TableHead><TableHead>Suggested</TableHead></TableRow></TableHeader><TableBody>{result.rows.map(r=><TableRow key={r.id}><TableCell>{r.date}</TableCell><TableCell>{chosen.find(i=>i.id===r.id)?.memberName}</TableCell><TableCell>{r.shares.toLocaleString('en-US')}</TableCell><TableCell>{r.allocated.toLocaleString('en-US')}</TableCell></TableRow>)}</TableBody></Table><p>Unallocated shares: {result.remaining.toLocaleString('en-US')}.</p></>}
  </section>
}
