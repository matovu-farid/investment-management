import {strict as assert} from 'node:assert'
import {readFileSync,readdirSync} from 'node:fs'
import {test} from 'node:test'

const origin=process.env.RNIG_AUTH_TEST_ORIGIN
const publicRoutes=new Set(['/login','/forgot-password','/reset-password','/accept-invitation'])
test('signed-out page requests redirect to sign-in, including malformed acknowledgment links',{skip:!origin},async()=>{
 assert.equal(new URL(origin!).origin,'http://localhost:3000')
 const routes=readdirSync('src/routes').filter(name=>name.endsWith('.tsx')).flatMap(name=>{
  const match=/createFileRoute\(['"]([^'"]+)/.exec(readFileSync(`src/routes/${name}`,'utf8'))
  return match&&!publicRoutes.has(match[1])?[match[1]]:[]
 })
 routes.push('/lending-acknowledgment?kind=invalid&id=example','/lending-acknowledgment?kind=repayment&id=example')
 for(const route of routes){
  let current=new URL(route,origin)
  for(let redirects=0;redirects<3&&current.pathname!=='/login';redirects++){
   const response=await fetch(current,{redirect:'manual'})
   assert.ok([302,303,307,308].includes(response.status),`${route}: expected redirect, received ${response.status}`)
   const location=response.headers.get('location');assert.ok(location,`${route}: missing redirect location`)
   current=new URL(location,current);assert.equal(current.origin,new URL(origin!).origin,`${route}: redirect left the app`)
  }
  assert.equal(current.pathname,'/login',`${route}: expected sign-in`)
 }
})
