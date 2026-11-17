import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {readFileSync,readdirSync} from 'node:fs'

const origin=process.env.RNIG_AUTH_TEST_ORIGIN,email=process.env.RNIG_AUTH_TEST_EMAIL,password=process.env.RNIG_AUTH_TEST_PASSWORD
const publicRoutes=new Set(['/login','/forgot-password','/reset-password','/accept-invitation'])
const adminFailures=[
 'This register is unavailable or you do not have permission to view it.',
 'The lending register is unavailable or access could not be confirmed.',
 'The investment register is unavailable or access could not be confirmed.',
 'The holding register is unavailable or access could not be confirmed.',
 'The register is unavailable or access was denied.',
 'Members are unavailable or your access could not be confirmed.',
 'Accounts are unavailable or access could not be confirmed.',
 'Booking history is unavailable or you do not have permission.',
 'Booking statuses are unavailable or access could not be confirmed.',
 'Member changes are unavailable or access could not be confirmed.',
 'Loan terms are unavailable or access could not be confirmed.',
 'Loan balances are unavailable or access could not be confirmed.',
 'Access information or drafts are unavailable.',
 'Workspace overview unavailable',
 'Overview counts unavailable',
 'Investment register unavailable',
]

test('administrator pages return rendered content without a generic error boundary',{skip:!origin},async()=>{
 const base=new URL(origin!);assert.equal(base.origin,'http://localhost:3000');assert.ok(email&&password)
 const signedIn=await fetch(`${base.origin}/api/auth/sign-in/email`,{method:'POST',headers:{origin:base.origin,'content-type':'application/json'},body:JSON.stringify({email,password})})
 assert.equal(signedIn.status,200);const cookie=signedIn.headers.getSetCookie().map(x=>x.split(';',1)[0]).join('; ');assert.ok(cookie)
 const routes=readdirSync('src/routes').filter(name=>name.endsWith('.tsx')).flatMap(name=>{
  const match=/createFileRoute\(['"]([^'"]+)/.exec(readFileSync(`src/routes/${name}`,'utf8'))
  return match&&!publicRoutes.has(match[1])?[match[1]]:[]
 }).sort()
 const failures:string[]=[]
 for(const route of routes){
  let current=new URL(route,base);let response:Response|null=null
  for(let redirects=0;redirects<4;redirects++){
   response=await fetch(current,{headers:{cookie},redirect:'manual'})
   if(![301,302,303,307,308].includes(response.status))break
   const location=response.headers.get('location');if(!location){failures.push(`${route}: missing redirect location`);break}
   current=new URL(location,current);if(current.origin!==base.origin||current.pathname==='/login'){failures.push(`${route}: redirected to ${current.pathname}`);break}
  }
  if(response&&response.status!==200)failures.push(`${route}: HTTP ${response.status}`)
  else if(response){
   const contentType=response.headers.get('content-type')??'',html=await response.text()
   if(!contentType.includes('text/html')||!/<main[\s>]/i.test(html))failures.push(`${route}: missing rendered page`)
   if(/>This page is unavailable<|>Something went wrong!<|>Page not found</i.test(html))failures.push(`${route}: rendered an error boundary`)
   for(const marker of adminFailures)if(html.includes(marker))failures.push(`${route}: ${marker}`)
  }
 }
 assert.deepEqual(failures,[],`Administrator page failures:\n${failures.join('\n')}`)
})
