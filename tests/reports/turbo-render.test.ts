import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {TurboReviewResult,TurboSelectionFields,turboSelectionPayload} from '../../src/components/turbo-review'

test('renders memo references safely and labels older saved reviews',()=>{
 const review={deals:[{investmentId:'a',name:'<Deal>',amountMinor:'100',basisPoints:'4000',comparison:'above' as const,memoReference:'<memo>'},{investmentId:'b',name:'Legacy',amountMinor:'10',basisPoints:'400',comparison:'within' as const}]}
 const html=renderToStaticMarkup(createElement(TurboReviewResult,{review,currency:'UGX',total:'250'}))
 expect(html).toContain('&lt;Deal&gt;');expect(html).toContain('&lt;memo&gt;');expect(html).toContain('memo reference: not recorded');expect(html).toContain('not verified')
})
test('memo payload trims references and leaves blank ones absent',()=>{
 expect(turboSelectionPayload({investmentIds:['a','b'],memoReferences:{a:'  Memo  ',b:'  '}})).toEqual({investmentIds:['a','b'],memoReferences:{a:'Memo'}})
})
test('review cannot be enabled before the policy date',()=>{
 const html=renderToStaticMarkup(createElement(TurboSelectionFields,{asOf:'2025-09-27',value:null,onChange:()=>{},investments:[]}))
 expect(html).toContain('28 September 2025');expect(html).toContain('disabled=""')
})
