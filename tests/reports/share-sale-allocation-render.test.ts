import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {ShareSaleAllocation} from '../../src/components/share-sale-allocation'

test('a sale plan asks the administrator to review remaining shares before calculating',()=>{
 const html=renderToStaticMarkup(createElement(ShareSaleAllocation,{shares:10,interests:[{id:'i',memberName:'Test member',interestDate:'2026-01-02',shares:8}]}))
 expect(html).toContain('Original request: 10 shares')
 expect(html).toContain('Reviewed shares still available')
 expect(html).toContain('Completed transfers are not linked')
 expect(html).toContain('Calculate provisional plan')
 expect(html).toContain('disabled=""')
})
