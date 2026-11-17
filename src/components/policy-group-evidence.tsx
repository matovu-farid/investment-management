import type {calculateAllocation} from '#/server/allocation/calculate'
type Group=ReturnType<typeof calculateAllocation>['policyGroups'][number]
/** Render the values captured with the comparison, not a live policy lookup. */
export function PolicyGroupEvidence({group:g}:{group:Group}){
 return <li>{g.policy.assetClass} · effective {g.policy.effectiveDate} · {g.explicitZero?'no selected class (explicit zero; not proof of no portfolio holdings)':g.assetClasses.join(', ')} · {BigInt(g.amountMinor).toLocaleString('en-US')} minor units · {g.basisPoints} basis points · {g.comparison} · range {g.policy.minBasisPoints??'—'}–{g.policy.maxBasisPoints??'—'} basis points · target {g.policy.targetBasisPoints??'—'} · source {g.policy.source||'not recorded'} · policy {g.policy.id}</li>
}
