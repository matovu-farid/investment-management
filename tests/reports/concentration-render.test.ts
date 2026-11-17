import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {InvestmentConcentration} from '../../src/components/investment-concentration'

test('renders exact policy screen and selected-source limitations',()=>{
 const html=renderToStaticMarkup(createElement(InvestmentConcentration,{allocation:{asOf:'2026-01-01',total:'1000000',selected:[{investmentId:'a',name:'<Synthetic>',amountMinor:'450001'}]}}))
 expect(html).toContain('&lt;Synthetic&gt;')
 expect(html).toContain('45.00%')
 expect(html).toContain('above 45% of selected total')
 expect(html).toContain('not a compliance determination')
})
test('does not apply the policy to dates before the policy',()=>{
 const html=renderToStaticMarkup(createElement(InvestmentConcentration,{allocation:{asOf:'2025-09-27',total:'100',selected:[{investmentId:'a',name:'Old',amountMinor:'100'}]}}))
 expect(html).toContain('precedes this policy')
 expect(html).not.toContain('above 45% of selected total')
})
