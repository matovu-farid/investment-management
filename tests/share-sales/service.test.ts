import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createSale, addInterest, addStatus, listSales, type Sale, type Interest, type Status } from '../../src/server/share-sales/service.ts'
const key='35551bcd-4a22-476d-831d-cfcf45f8f629'
const repo={roleFor:async()=> 'admin',createSale:async(v:Sale)=>v, addInterest:async(v:Interest)=>v, list:async()=>({members:[],sales:[],interests:[],statuses:[]}), addStatus:async(v:Status)=>v}
const sale={requestKey:key,memberId:'member',shares:'10',askingPriceMinor:'200',currency:'UGX',requestDate:'2026-01-01',notes:''}
test('requires an administrator for reads and writes',async()=>{await assert.rejects(listSales(repo,null),/unauthorized/i); await assert.rejects(createSale({...repo,roleFor:async()=>null},'x',sale),/unauthorized/i)})
test('validates sale facts, date and price',async()=>{const s=await createSale(repo,'admin',sale); assert.equal(s.shares,10); for(const patch of [{shares:'0'},{askingPriceMinor:'1.2'},{requestDate:'2026-02-30'},{currency:'ugx'},{requestKey:'bad'}]) await assert.rejects(createSale(repo,'admin',{...sale,...patch}))})
test('validates interest amount and date',async()=>{const input={requestKey:key,saleId:'sale',memberId:'buyer',interestDate:'2026-02-01',shares:'3',notes:''};const result=await addInterest(repo,'admin',input);assert.equal(result.shares,3);await assert.rejects(addInterest(repo,'admin',{...input,interestDate:'not-a-date'}))})

test('validates status and restricts recording to administrators',async()=>{const input={requestKey:key,saleId:'sale',statusDate:'2026-02-02',status:'closed',notes:''};assert.equal((await addStatus(repo,'admin',input)).status,'closed');await assert.rejects(addStatus(repo,'admin',{...input,status:'executed'}));await assert.rejects(addStatus(repo,null,input),/unauthorized/i)})
