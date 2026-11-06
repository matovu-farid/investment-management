export type LoanImportRow = {sourceRef:string;memberNumber:string;principalMinor:string;currency:string;disbursementDate:string;maturityDate:string|null;terms:string}
export type RepaymentImportRow = {sourceRef:string;loanSourceRef:string;paymentDate:string;amountMinor:string;reference:string|null;notes:string|null}
export type LendingImportKind = 'loan'|'repayment'
export type LendingImportRow = LoanImportRow|RepaymentImportRow
const header={loan:['source_ref','member_number','principal_minor','currency','disbursement_date','maturity_date','terms'],repayment:['source_ref','loan_source_ref','payment_date','amount_minor','reference','notes']}
const date=(s:string)=>{const n=Date.parse(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s}
const amount=(s:string)=>/^[1-9]\d*$/.test(s)&&Number.isSafeInteger(Number(s))
export function parseLendingCsv(kind:LendingImportKind,input:string):{rows:LendingImportRow[];errors:string[]} {
 if(input.length>200_000)return {rows:[],errors:['CSV is too large (maximum 200,000 characters).']}
 const records:string[][]=[];let fields:string[]=[],field='',quoted=false,ended=false,start=true
 const saveField=()=>{fields.push(field);field='';start=true;ended=false}
 const saveRecord=()=>{saveField();records.push(fields);fields=[]}
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++}else if(c==='"'){quoted=false;ended=true}else if(c==='\r'&&input[i+1]==='\n'){field+='\n';i++}else field+=c}
 else if(c===',')saveField();else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;saveRecord()}else if(c==='"'&&start){quoted=true;start=false}else if(c==='"'||ended)return {rows:[],errors:['Malformed CSV: unexpected character around a quoted field.']};else{field+=c;start=false}}
 if(quoted)return {rows:[],errors:['Malformed CSV: a quoted field was not closed.']};if(fields.length||field||ended)saveRecord()
 if(!records.length)return {rows:[],errors:['Enter a header and at least one row.']};records[0][0]=records[0][0].replace(/^\uFEFF/,'')
 if(records[0].length!==header[kind].length||records[0].some((v,i)=>v!==header[kind][i]))return {rows:[],errors:[`Header must be ${header[kind].join(',')}.`]}
 const rows:LendingImportRow[]=[],errors:string[]=[],seen=new Set<string>();if(records.length===1)errors.push('Enter at least one record.');if(records.length>101)errors.push('At most 100 records may be imported at once.')
 for(let i=1;i<records.length;i++){const r=records[i],label=`Record ${i+1}`;if(r.length!==header[kind].length){errors.push(`${label}: expected ${header[kind].length} columns.`);continue}const values=r.map(v=>v.trim()),sourceRef=values[0]
 if(!sourceRef||sourceRef.length>128)errors.push(`${label}: source reference is required (maximum 128 characters).`);if(seen.has(sourceRef))errors.push(`${label}: duplicate source reference.`);seen.add(sourceRef)
 if(kind==='loan'){if(sourceRef.startsWith('id:'))errors.push(`${label}: the id: prefix is reserved for existing loan IDs.`);const [,memberNumber,principalMinor,currency,disbursementDate,maturityDate,terms]=values;if(!memberNumber||memberNumber.length>64)errors.push(`${label}: member number is required.`);if(!amount(principalMinor))errors.push(`${label}: principal must be a positive whole number within the supported range.`);if(!/^[A-Z]{3}$/.test(currency))errors.push(`${label}: currency must be a three-letter uppercase code.`);if(!date(disbursementDate))errors.push(`${label}: disbursement date is invalid.`);if(maturityDate&&(!date(maturityDate)||maturityDate<disbursementDate))errors.push(`${label}: maturity date is invalid or precedes disbursement.`);if(!terms||terms.length>4000)errors.push(`${label}: terms are required (maximum 4,000 characters).`);rows.push({sourceRef,memberNumber,principalMinor,currency,disbursementDate,maturityDate:maturityDate||null,terms})}
 else{const [,loanSourceRef,paymentDate,amountMinor,reference,notes]=values;if(!loanSourceRef||loanSourceRef.length>128)errors.push(`${label}: loan source reference is required.`);if(!date(paymentDate))errors.push(`${label}: payment date is invalid.`);if(!amount(amountMinor))errors.push(`${label}: amount must be a positive whole number within the supported range.`);if(reference.length>200||notes.length>2000)errors.push(`${label}: reference or notes exceed the allowed length.`);rows.push({sourceRef,loanSourceRef,paymentDate,amountMinor,reference:reference||null,notes:notes||null})}}
 return {rows,errors}
}
