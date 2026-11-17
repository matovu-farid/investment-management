export function parseAcknowledgmentSearch(search:Record<string,unknown>):{kind:'disbursement'|'repayment'|null;id:string}{
 if((search.kind!=='disbursement'&&search.kind!=='repayment')||typeof search.id!=='string'||!search.id||search.id.length>128)return {kind:null,id:''}
 return {kind:search.kind,id:search.id}
}
