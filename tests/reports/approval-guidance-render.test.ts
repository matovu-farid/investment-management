import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {ApprovalGuidance} from '../../src/components/approval-guidance'
test('approval reference identifies applicable thresholds without claiming approval',()=>{
 const html=renderToStaticMarkup(createElement(ApprovalGuidance,{currency:'UGX',amount:'300000001',date:'2026-01-01',kind:'investment'}))
 expect(html).toContain('General Manager and Board');expect(html).toContain('member vote if required');expect(html).toContain('does not grant or confirm approval')
 expect(renderToStaticMarkup(createElement(ApprovalGuidance,{currency:'USD',amount:'1',date:'2026-01-01',kind:'loan'}))).toBe('')
})
test('approval guidance includes the policy periods without inventing due dates',()=>{
 const html=renderToStaticMarkup(createElement(ApprovalGuidance,{currency:'UGX',amount:'1000000',date:'2026-01-01',kind:'loan'}))
 expect(html).toContain('5 days');expect(html).toContain('14 days');expect(html).toContain('60 days');expect(html).toContain('starting point')
})
