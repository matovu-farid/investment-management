import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {fromCrossJSON} from 'seroval'

const origin=process.env.RNIG_AUTH_TEST_ORIGIN,password=process.env.RNIG_MEMBER_TEST_PASSWORD
const firstEmail=process.env.RNIG_MEMBER_TEST_EMAIL,secondEmail=process.env.RNIG_OTHER_MEMBER_TEST_EMAIL

test('each linked member receives only their own portfolio records',{skip:!origin},async()=>{
 const base=new URL(origin!);assert.equal(base.origin,'http://localhost:3000')
 assert.ok(password&&firstEmail&&secondEmail,'supply disposable local member credentials')
 const headers={'content-type':'application/json',origin:base.origin}
 async function signIn(email:string){const response=await fetch(`${base.origin}/api/auth/sign-in/email`,{method:'POST',headers,body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.getSetCookie().map(x=>x.split(';',1)[0]).join('; ')}
 const module=await fetch(`${base.origin}/src/server/portal/functions.ts`);assert.equal(module.status,200)
 const match=(await module.text()).match(/export const myPortfolioFn[^\n]*createClientRpc\("([^\"]+)"\)/);assert.ok(match)
 async function portfolio(email:string){const cookie=await signIn(email),response=await fetch(`${base.origin}/_serverFn/${match![1]}`,{headers:{cookie,origin:base.origin,'x-tsr-serverFn':'true',accept:'application/json'}});assert.equal(response.status,200);return fromCrossJSON(await response.json() as never,{}) as {result:{status:string;portfolio:{member:{id:string};shares:{id:string}[];loans:{id:string}[];repayments:{id:string}[];bookings:{id:string}[];jointHoldings:{id:string}[];jointEvents:{id:string}[]}}}}
 for(const [email,own,other] of [[firstEmail!,'one','two'],[secondEmail!,'two','one']] as const){
  const {result}=await portfolio(email);assert.equal(result.status,'linked');assert.equal(result.portfolio.member.id,own==='one'?'audit-member':'member-two')
  for(const [kind,prefix] of [['shares','share'],['loans','loan'],['repayments','payment'],['bookings','booking']] as const)assert.deepEqual(result.portfolio[kind].map(x=>x.id),[`${prefix}-${own}`])
  assert.deepEqual(result.portfolio.jointHoldings.map(x=>x.id),own==='one'?['joint-both']:['joint-both','joint-private-two'])
  assert.deepEqual(result.portfolio.jointEvents.map(x=>x.id),own==='one'?['joint-event-both']:['joint-event-both','joint-event-private-two'])
  const otherMember=other==='one'?'audit-member':'member-two'
  assert.doesNotMatch(JSON.stringify(result),new RegExp(`${otherMember}|share-${other}|loan-${other}|payment-${other}|booking-${other}|PRIVATE-ACCOUNT-ONE|PRIVATE-ACCOUNT-TWO`))
 }
})
