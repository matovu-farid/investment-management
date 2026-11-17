/** Only explicitly selected policies count, even for names such as "__proto__". */
export function getMapping(mapping:Record<string,string>,name:string):string {
 return Object.hasOwn(mapping,name)?mapping[name]:''
}

export function updateMapping(mapping:Record<string,string>,name:string,value:string):Record<string,string> {
 const next={...mapping}
 if(value)Object.defineProperty(next,name,{value,enumerable:true,writable:true,configurable:true})
 else delete next[name]
 return next
}

/** A later record is a review prompt, not proof that it legally supersedes this range. */
export function laterPolicyDate(policy:{assetClass:string;effectiveDate:string},policies:{assetClass:string;effectiveDate:string}[],asOf:string):string|null {
 const later=policies.filter(p=>p.assetClass===policy.assetClass&&p.effectiveDate>policy.effectiveDate&&p.effectiveDate<=asOf).map(p=>p.effectiveDate).sort()
 return later.at(-1)??null
}
