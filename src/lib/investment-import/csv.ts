export type InvestmentImportKind='investment'|'valuation'|'transaction'
export type InvestmentRow={sourceRef:string;name:string;assetClass:string;currency:string;status:'active'|'closed'}
export type ValuationRow={sourceRef:string;investmentRef:string;valuationDate:string;amountMinor:string;basis:string;source:string|null;notes:string|null}
export type TransactionRow={sourceRef:string;investmentRef:string;transactionDate:string;transactionType:string;amountMinor:string;reference:string|null;notes:string|null}
export type InvestmentImportRow=InvestmentRow|ValuationRow|TransactionRow
export const headers:Record<InvestmentImportKind,string[]>={investment:['source_ref','name','asset_class','currency','status'],valuation:['source_ref','investment_ref','valuation_date','amount_minor','basis','source','notes'],transaction:['source_ref','investment_ref','transaction_date','transaction_type','amount_minor','reference','notes']}
const validDate=(s:string)=>{const n=Date.parse(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s}
const validAmount=(s:string,zero:boolean)=>/^(0|[1-9]\d*)$/.test(s)&&Number.isSafeInteger(Number(s))&&(zero||Number(s)>0)
export function parseInvestmentCsv(kind:InvestmentImportKind,input:string):{rows:InvestmentImportRow[];errors:string[]}{
 if(input.length>200_000)return {rows:[],errors:['CSV is too large (maximum 200,000 characters).']}
 const records:string[][]=[];let fields:string[]=[],field='',quoted=false,ended=false,start=true
 const saveField=()=>{fields.push(field);field='';start=true;ended=false}
 const saveRecord=()=>{saveField();records.push(fields);fields=[]}
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++}else if(c==='"'){quoted=false;ended=true}else if(c==='\r'&&input[i+1]==='\n'){field+='\n';i++}else field+=c}else if(c===',')saveField();else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;saveRecord()}else if(c==='"'&&start){quoted=true;start=false}else if(c==='"'||ended)return {rows:[],errors:['Malformed CSV: unexpected character around a quoted field.']};else{field+=c;start=false}}
 if(quoted)return {rows:[],errors:['Malformed CSV: a quoted field was not closed.']};if(fields.length||field||ended)saveRecord()
 if(!records.length)return {rows:[],errors:['Enter a header and at least one row.']};records[0][0]=records[0][0].replace(/^\uFEFF/,'')
 if(records[0].length!==headers[kind].length||records[0].some((v,i)=>v!==headers[kind][i]))return {rows:[],errors:[`Header must be ${headers[kind].join(',')}.`]}
 const rows:InvestmentImportRow[]=[],errors:string[]=[],seen=new Set<string>();if(records.length===1)errors.push('Enter at least one record.');if(records.length>101)errors.push('At most 100 records may be imported at once.')
 for(let i=1;i<records.length;i++){
  const raw=records[i],label=`Record ${i+1}`;if(raw.length!==headers[kind].length){errors.push(`${label}: expected ${headers[kind].length} columns.`);continue}const v=raw.map(s=>s.trim()),sourceRef=v[0]
  if(!sourceRef||sourceRef.length>128)errors.push(`${label}: source reference is required (maximum 128 characters).`);if(seen.has(sourceRef))errors.push(`${label}: duplicate source reference.`);seen.add(sourceRef)
  if(kind==='investment'){
   const [,name,assetClass,currency,status]=v;if(sourceRef.startsWith('id:'))errors.push(`${label}: id: is reserved for existing investment IDs.`);if(!name||name.length>200||!assetClass||assetClass.length>100)errors.push(`${label}: name and asset class are required and must be within their length limits.`);if(!/^[A-Z]{3}$/.test(currency))errors.push(`${label}: currency must be a three-letter uppercase code.`);if(status!=='active'&&status!=='closed')errors.push(`${label}: status must be active or closed.`);rows.push({sourceRef,name,assetClass,currency,status:status as 'active'|'closed'})
  }else if(kind==='valuation'){
   const [,investmentRef,valuationDate,amountMinor,basis,source,notes]=v;if(!investmentRef||investmentRef.length>128)errors.push(`${label}: investment reference is required.`);if(!validDate(valuationDate))errors.push(`${label}: valuation date is invalid.`);if(!validAmount(amountMinor,true))errors.push(`${label}: value must be a non-negative whole number within the supported range.`);if(!basis||basis.length>200||source.length>200||notes.length>2000)errors.push(`${label}: basis is required and source and notes must be within their length limits.`);rows.push({sourceRef,investmentRef,valuationDate,amountMinor,basis,source:source||null,notes:notes||null})
  }else{
   const [,investmentRef,transactionDate,transactionType,amountMinor,reference,notes]=v;if(!investmentRef||investmentRef.length>128)errors.push(`${label}: investment reference is required.`);if(!validDate(transactionDate))errors.push(`${label}: transaction date is invalid.`);if(!validAmount(amountMinor,false))errors.push(`${label}: amount must be a positive whole number within the supported range.`);if(!transactionType||transactionType.length>100||reference.length>200||notes.length>2000)errors.push(`${label}: transaction type is required and reference and notes must be within their length limits.`);rows.push({sourceRef,investmentRef,transactionDate,transactionType,amountMinor,reference:reference||null,notes:notes||null})
  }
 }
 return {rows,errors}
}
