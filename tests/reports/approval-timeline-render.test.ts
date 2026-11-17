import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {ApprovalTimeline} from '../../src/components/approval-timeline'
test('approval-period illustration requires explicitly selected dates and explains its limits',()=>{
 const html=renderToStaticMarkup(createElement(ApprovalTimeline))
 expect(html).toContain('Reviewed start date');expect(html).toContain('Compare as of');expect(html).toContain('calendar days');expect(html).toContain('not official deadlines');expect(html).toContain('disabled=""')
})
