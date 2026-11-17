import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {fromCrossJSON,toJSONAsync} from 'seroval'

const origin=process.env.RNIG_AUTH_TEST_ORIGIN
const adminEmail=process.env.RNIG_AUTH_TEST_EMAIL,adminPassword=process.env.RNIG_AUTH_TEST_PASSWORD
const memberEmail=process.env.RNIG_MEMBER_TEST_EMAIL,memberPassword=process.env.RNIG_MEMBER_TEST_PASSWORD

test('linked member cannot read administrator-only server functions',{skip:!origin},async()=>{
 const base=new URL(origin!);assert.equal(base.origin,'http://localhost:3000')
 assert.ok(adminEmail&&adminPassword&&memberEmail&&memberPassword,'supply disposable local credentials')
 const headers={'content-type':'application/json',origin:base.origin}
 async function signIn(email:string,password:string){const response=await fetch(`${base.origin}/api/auth/sign-in/email`,{method:'POST',headers,body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.getSetCookie().map(x=>x.split(';',1)[0]).join('; ')}
 async function functionId(module:string,name:string){const response=await fetch(`${base.origin}/src/server/${module}/functions.ts`);assert.equal(response.status,200);const source=await response.text(),match=source.match(new RegExp(`export const ${name}[^\\n]*createClientRpc\\("([^\\"]+)"\\)`));assert.ok(match,`missing ${name}`);return match[1]}
 async function invoke(id:string,cookie:string){return fetch(`${base.origin}/_serverFn/${id}`,{headers:{cookie,origin:base.origin,'x-tsr-serverFn':'true',accept:'application/json'}})}
 const admin=await signIn(adminEmail!,adminPassword!),member=await signIn(memberEmail!,memberPassword!)
 const portal=await functionId('portal','myPortfolioFn'),own=await invoke(portal,member)
 assert.equal(own.status,200);const ownResult=fromCrossJSON(await own.json() as never,{}) as {result?:{status?:string;portfolio?:{member?:{id?:string}}}}
 assert.equal(ownResult.result?.status,'linked');assert.equal(ownResult.result?.portfolio?.member?.id,'audit-member')
 const detailsId=await functionId('credit-request-details','listCreditRequestDetailsFn')
 const query=new URLSearchParams({payload:JSON.stringify(await toJSONAsync({data:'booking-one'}))})
 const detailsUrl=`${base.origin}/_serverFn/${detailsId}?${query}`
 const adminDetails=await fetch(detailsUrl,{headers:{cookie:admin,origin:base.origin,'x-tsr-serverFn':'true',accept:'application/json'}})
 assert.equal(adminDetails.status,200)
 const decodedDetails=fromCrossJSON(await adminDetails.json() as never,{}) as {result?:Array<{receivingAccount:string}>}
 assert.equal(decodedDetails.result?.[0]?.receivingAccount,'PRIVATE-ACCOUNT-ONE')
 const memberDetails=await fetch(detailsUrl,{headers:{cookie:member,origin:base.origin,'x-tsr-serverFn':'true',accept:'application/json'}})
 const denied=await memberDetails.text()
 assert.doesNotMatch(denied,/PRIVATE-ACCOUNT-(ONE|TWO)/)
 if(memberDetails.status===200){const decoded=JSON.parse(denied) as {p?:{k?:string[]}};assert.ok(decoded.p?.k?.includes('error'));assert.match(denied,/Unauthorized/i)}else assert.ok([401,403].includes(memberDetails.status))
 for(const [module,name] of [['members','listMembersFn'],['lending','listLendingFn'],['investments','listInvestmentsFn'],['policy','listPolicyTargetsFn'],['allocation','allocationDataFn'],['allocation','portfolioOptionsFn'],['portal','linkOptionsFn'],['loan-billing','listLoanBillingFn'],['share-sales','listSalesFn'],['collateral','listCollateralFn'],['board-packets','listBoardPacketsFn'],['board-packets','boardPacketOptionsFn']] as const){
  const id=await functionId(module,name),adminResponse=await invoke(id,admin);assert.equal(adminResponse.status,200,`${name}: administrator access failed`);assert.match(adminResponse.headers.get('cache-control')??'',/\bprivate\b.*\bno-store\b/i,`${name}: administrator response must not be cached`);const adminResult=fromCrossJSON(await adminResponse.json() as never,{}) as {result?:unknown};assert.ok(adminResult.result!==undefined,`${name}: administrator result missing`)
  const memberResponse=await invoke(id,member),body=await memberResponse.text()
  assert.match(memberResponse.headers.get('cache-control')??'',/\bprivate\b.*\bno-store\b/i,`${name}: member response must not be cached`)
  assert.doesNotMatch(body,/AUDIT-001|role-admin@example\.test/,`${name}: leaked protected data`)
  assert.ok([200,401,403].includes(memberResponse.status),`${name}: unexpected response ${memberResponse.status}`)
  if(memberResponse.status===200){const decoded=JSON.parse(body) as {p?:{k?:string[]}};assert.ok(decoded.p?.k?.includes('error'),`${name}: member received a successful result`);assert.match(body,/Unauthorized/i,`${name}: expected an authorization failure`)}
 }
})
