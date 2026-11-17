import {test,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {DirectorCapacity} from '../../src/components/director-capacity'
test('director review does not ask for a holding and requires a date',()=>{
 const html=renderToStaticMarkup(createElement(DirectorCapacity,{memberId:'director'}))
 expect(html).toContain('Independent-director limit review');expect(html).toContain('UGX 5,000,000');expect(html).toContain('Review date');expect(html).not.toContain('share price');expect(html).toContain('disabled=""')
})
