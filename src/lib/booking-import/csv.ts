export type BookingImportRow={sourceRef:string;memberNumber:string;requestedMinor:string;currency:string;requestedDate:string;status:'waiting'|'held'|'closed'|'cancelled';notes:string|null}
const headers=['source_ref','member_number','requested_minor','currency','requested_date','status','notes']
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s
export function parseBookingCsv(input:string):{rows:BookingImportRow[];errors:string[]}{
 if(input.length>200_000)return {rows:[],errors:['CSV is too large (maximum 200,000 characters).']}
 const records:string[][]=[];let fields:string[]=[],field='',quoted=false,ended=false,start=true
 const saveField=()=>{fields.push(field);field='';start=true;ended=false};const saveRecord=()=>{saveField();records.push(fields);fields=[]}
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++}else if(c==='"'){quoted=false;ended=true}else if(c==='\r'&&input[i+1]==='\n'){field+='\n';i++}else field+=c}else if(c===',')saveField();else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;saveRecord()}else if(c==='"'&&start){quoted=true;start=false}else if(c==='"'||ended)return {rows:[],errors:['Malformed CSV: unexpected character around a quoted field.']};else{field+=c;start=false}}
 if(quoted)return {rows:[],errors:['Malformed CSV: a quoted field was not closed.']};if(fields.length||field||ended)saveRecord()
 if(!records.length)return {rows:[],errors:['Enter a header and at least one record.']};records[0][0]=records[0][0].replace(/^\uFEFF/,'')
 if(records[0].length!==headers.length||records[0].some((v,i)=>v!==headers[i]))return {rows:[],errors:[`Header must be ${headers.join(',')}.`]}
 const rows:BookingImportRow[]=[],errors:string[]=[],seen=new Set<string>();if(records.length===1)errors.push('Enter at least one record.');if(records.length>101)errors.push('At most 100 records may be imported at once.')
 for(let i=1;i<records.length;i++){const r=records[i],label=`Record ${i+1}`;if(r.length!==headers.length){errors.push(`${label}: expected ${headers.length} columns.`);continue}const [sourceRef,memberNumber,requestedMinor,currency,requestedDate,status,notes]=r.map(v=>v.trim())
 if(!sourceRef||sourceRef.length>128)errors.push(`${label}: source reference is required (maximum 128 characters).`);if(seen.has(sourceRef))errors.push(`${label}: duplicate source reference.`);seen.add(sourceRef)
 if(!memberNumber||memberNumber.length>64)errors.push(`${label}: member number is required.`);if(!/^[1-9]\d*$/.test(requestedMinor)||!Number.isSafeInteger(Number(requestedMinor)))errors.push(`${label}: requested amount must be a positive whole number within the supported range.`);if(!/^[A-Z]{3}$/.test(currency))errors.push(`${label}: currency must be a three-letter uppercase code.`);if(!validDate(requestedDate))errors.push(`${label}: requested date is invalid.`);if(!['waiting','held','closed','cancelled'].includes(status))errors.push(`${label}: status must be waiting, held, closed or cancelled.`);if(notes.length>2000)errors.push(`${label}: notes exceed 2,000 characters.`)
 rows.push({sourceRef,memberNumber,requestedMinor,currency,requestedDate,status:status as BookingImportRow['status'],notes:notes||null})}
 return {rows,errors}
}
