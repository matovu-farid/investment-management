import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {randomUUID} from 'node:crypto'
import {fromCrossJSON,toJSONAsync} from 'seroval'

const origin=process.env.RNIG_AUTH_TEST_ORIGIN
const adminEmail=process.env.RNIG_AUTH_TEST_EMAIL,adminPassword=process.env.RNIG_AUTH_TEST_PASSWORD
const memberEmail=process.env.RNIG_MEMBER_TEST_EMAIL,memberPassword=process.env.RNIG_MEMBER_TEST_PASSWORD

test('linked member cannot create administrator records',{skip:!origin},async()=>{
 const base=new URL(origin!);assert.equal(base.origin,'http://localhost:3000')
 assert.ok(adminEmail&&adminPassword&&memberEmail&&memberPassword,'supply disposable local credentials')
 const headers={'content-type':'application/json',origin:base.origin}
 async function signIn(email:string,password:string){const response=await fetch(`${base.origin}/api/auth/sign-in/email`,{method:'POST',headers,body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.getSetCookie().map(x=>x.split(';',1)[0]).join('; ')}
 async function functionId(module:string,name:string){const response=await fetch(`${base.origin}/src/server/${module}/functions.ts`);assert.equal(response.status,200);const source=await response.text(),match=source.match(new RegExp(`export const ${name}[^\\n]*createClientRpc\\("([^\\"]+)"\\)`));assert.ok(match,`missing ${name}`);return match[1]}
 async function invoke(id:string,cookie:string,data:unknown){return fetch(`${base.origin}/_serverFn/${id}`,{method:'POST',headers:{...headers,cookie,'x-tsr-serverFn':'true',accept:'application/json'},body:JSON.stringify(await toJSONAsync({data}))})}
 const admin=await signIn(adminEmail!,adminPassword!),member=await signIn(memberEmail!,memberPassword!)
 const cases=[
  {module:'credit-request-details',name:'saveCreditRequestDetailsFn',data:{bookingId:'booking-one',expectedRevision:'request-details-one',requestKey:randomUUID(),purpose:'Revised fictional purpose',repaymentPromise:'Monthly',interestOption:'2%',duration:'12 months',receivingAccount:'PRIVATE-ACCOUNT-ONE'}},
  {module:'members',name:'createMemberFn',data:{memberNumber:`TEST-${randomUUID()}`,fullName:'Synthetic added member'}},
  {module:'investments',name:'createInvestmentFn',data:{name:'Synthetic investment',assetClass:'Bonds',currency:'UGX',requestKey:randomUUID()}},
  {module:'policy',name:'addPolicyTargetFn',data:{assetClass:`Synthetic ${randomUUID()}`,effectiveDate:'2026-01-01',minBasisPoints:'1000',maxBasisPoints:'2500',targetBasisPoints:'',source:'Synthetic source',requestKey:randomUUID()}},
  {module:'share-sales',name:'createSaleFn',data:{memberId:'audit-member',shares:'10',askingPriceMinor:'100',currency:'UGX',requestDate:'2026-01-01',requestKey:randomUUID()}},
  {module:'lending',name:'createLoanFn',data:{memberId:'audit-member',principalMinor:1000,currency:'UGX',disbursementDate:'2026-01-01',terms:'Synthetic terms',idempotencyKey:randomUUID()}},
 ]
 for(const item of cases){
  const id=await functionId(item.module,item.name),denied=await invoke(id,member,item.data),body=await denied.text()
  assert.ok([200,401,403].includes(denied.status),`${item.name}: unexpected response ${denied.status}`)
  if(denied.status===200){const error=JSON.parse(body) as {p?:{k?:string[]}};assert.ok(error.p?.k?.includes('error'),`${item.name}: member was not denied`);assert.match(body,/Unauthorized/i)}
  const accepted=await invoke(id,admin,item.data);assert.equal(accepted.status,200,`${item.name}: administrator request failed`)
  const adminBody=await accepted.text(),adminJson=JSON.parse(adminBody) as {p?:{k?:string[]}};assert.ok(!adminJson.p?.k?.includes('error'),`${item.name}: administrator received an error: ${adminBody}`)
  const decoded=fromCrossJSON(adminJson as never,{}) as {result?:{id?:string}};assert.ok(decoded.result?.id,`${item.name}: administrator did not create the record`)
 }
 // These preparation actions can expose board or portfolio data. Exercise only
 // the denied member path; do not create a board draft or risk capture here.
 const reportingCases=[
  {module:'board-packets',name:'previewBoardPacketFn',data:{start:'2026-01-01',end:'2026-04-30'}},
  {module:'board-packets',name:'startBoardRiskCaptureFn',data:{currency:'UGX',asOfDate:'2026-04-30'}},
  {module:'board-packets',name:'advanceBoardRiskCaptureFn',data:{id:'fictional-capture',expectedOffset:5}},
  {module:'allocation',name:'reviewPortfolioFn',data:{asOf:'2026-04-30',currency:'UGX',cashAccountIds:[],includeLending:false,selected:{},mappings:{},zeroPolicyIds:[],overlapReviewed:true}},
 ]
 for(const item of reportingCases){
  const id=await functionId(item.module,item.name),response=await invoke(id,member,item.data),body=await response.text()
  assert.match(response.headers.get('cache-control')??'',/\bprivate\b.*\bno-store\b/i,`${item.name}: response must not be cached`)
  assert.ok([200,401,403].includes(response.status),`${item.name}: unexpected response ${response.status}`)
  if(response.status===200){const error=JSON.parse(body) as {p?:{k?:string[]}};assert.ok(error.p?.k?.includes('error'),`${item.name}: member was not denied`);assert.match(body,/Unauthorized/i)}
 }
})
