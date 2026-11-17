import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {PolicyReference} from '../../src/components/policy-reference'
test('shows the source objectives without claiming measured performance',()=>{
 const html=renderToStaticMarkup(createElement(PolicyReference))
 expect(html).toContain('UGX 4 billion portfolio by 2030')
 expect(html).toContain('15% net of fees over a rolling six-year period')
 expect(html).toContain('not calculated results')
})
