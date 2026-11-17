import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {CreditRequestTimingSummary} from '../../src/components/credit-request-timing-summary'
test('renders each recorded timing count as an accessible figure',()=>{
 const html=renderToStaticMarkup(createElement(CreditRequestTimingSummary,{rows:[{total:4,completedWithin30:1,completedAfter30:1,remainderUnder30:0,remainder30OrMore:1,notClassified:1}]}))
 for(const label of ['Recorded requests','Recorded completion within 30 days','Recorded completion after 30 days','Remainder under 30 days','Remainder 30 days or more','Not classified'])expect(html).toContain(label)
 expect(html).toContain('<dl');expect(html).toContain('<dd');expect(html).toContain('>0<')
})
