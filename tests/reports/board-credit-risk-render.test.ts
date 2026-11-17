import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {CreditRiskPacketContent} from '../../src/components/board-credit-risk'
import {summarizeCreditRisk} from '../../src/lib/installment-tracking/risk-profile'

test('renders the captured risk coverage and escapes loan identifiers',()=>{
 const profile={...summarizeCreditRisk('UGX',[{loanId:'covered',currency:'UGX',risk:'mild',principalMinor:'900',interestMinor:'100'}]),asOfDate:'2026-08-31',offset:0,eligibleCount:2,totalEligible:2,nextOffset:null,fingerprint:'test',includedCount:1,unavailableLoanIds:['<loan>'],startedAt:'2026-08-31T10:00:00.000Z',finishedAt:'2026-08-31T10:01:00.000Z'}
 const html=renderToStaticMarkup(createElement(CreditRiskPacketContent,{profile}))
 expect(html).toContain('2026-08-31');expect(html).toContain('1 of 2 eligible loans included')
 expect(html).toContain('not an approved historical score');expect(html).toContain('1,000')
 expect(html).toContain('10% early-warning screen');expect(html).toContain('&lt;loan&gt;');expect(html).not.toContain('<loan>')
 expect(html).toContain('tabindex="0"');expect(html).toContain('aria-label="Board credit risk table"')
})
