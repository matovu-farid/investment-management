import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {EquitySelectionFields,EquityConcentrationResult,equitySelectionPayload} from '../../src/components/equity-concentration'
import {equityConcentration} from '../../src/lib/equity-concentration'

test('equity classification renders its fields and safe output',()=>{
 const input=renderToStaticMarkup(createElement(EquitySelectionFields,{asOf:'2026-01-01',value:{i:{company:'<Company>',sector:'Banking'}},onChange:()=>{},investments:[{id:'i',name:'<Bond>'}]}))
 expect(input).toContain('Company for &lt;Bond&gt;');expect(input).toContain('&lt;Company&gt;');expect(input).toContain('required=""')
 const result=equityConcentration([{investmentId:'i',name:'<Bond>',company:'<Company>',sector:'Banking',amountMinor:'100'}])
 const html=renderToStaticMarkup(createElement(EquityConcentrationResult,{review:result,currency:'UGX'}))
 expect(html).toContain('&lt;Company&gt;');expect(html).toContain('not a compliance determination');expect(html).toContain('100.00%')
})
test('classifications trim text and older dates cannot enable review',()=>{
 expect(equitySelectionPayload({i:{company:' A ',sector:' Banking '}})).toEqual({classifications:[{investmentId:'i',company:'A',sector:'Banking'}]})
 const html=renderToStaticMarkup(createElement(EquitySelectionFields,{asOf:'2025-09-27',value:null,onChange:()=>{},investments:[]}))
 expect(html).toContain('28 September 2025');expect(html).toContain('disabled=""')
})
test('conflicting sector classifications are visible, including older saved reviews',()=>{
 const review=equityConcentration([{investmentId:'a',name:'A',company:'Company',sector:'Banking',amountMinor:'50'},{investmentId:'b',name:'B',company:'Company',sector:'Other',amountMinor:'50'}])
 const legacy={...review,inconsistentCompanies:undefined} as unknown as typeof review
 const html=renderToStaticMarkup(createElement(EquityConcentrationResult,{review:legacy,currency:'UGX'}))
 expect(html).toContain('same company is assigned to multiple sectors');expect(html).toContain('Company')
})
test('warns about similar company and sector names in saved reviews',()=>{
 const review=equityConcentration([{investmentId:'a',name:'A',company:'Acme',sector:'Banking',amountMinor:'50'},{investmentId:'b',name:'B',company:'ACME',sector:'banking',amountMinor:'50'}])
 const html=renderToStaticMarkup(createElement(EquityConcentrationResult,{review,currency:'UGX'}))
 expect(html).toContain('Review similar names');expect(html).toContain('ACME / Acme');expect(html).toContain('Banking / banking');expect(html).toContain('counted separately')
})
