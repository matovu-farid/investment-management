import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {PolicyGroupEvidence} from '../../src/components/policy-group-evidence'
test('policy group presents the frozen date, source and exact range',()=>{
 const group={policy:{id:'policy-1',assetClass:'Bonds',effectiveDate:'2025-09-28',minBasisPoints:1000,maxBasisPoints:2500,targetBasisPoints:1500,source:'IPS <Board>'},assetClasses:['Treasuries'],amountMinor:'400',basisPoints:'2000',comparison:'within' as const,explicitZero:false}
 const html=renderToStaticMarkup(createElement(PolicyGroupEvidence,{group}))
 for(const text of ['Bonds','2025-09-28','IPS &lt;Board&gt;','1000','2500','1500','policy-1','Treasuries'])expect(html).toContain(text)
})
