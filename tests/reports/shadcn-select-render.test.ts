import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { NativeSelect, NativeSelectOption } from '../../src/components/ui/native-select'

test('select renders an accessible disabled shadcn trigger until hydration', () => {
  const html = renderToStaticMarkup(createElement(NativeSelect, { id: 'member', required: true, value: '', 'aria-label': 'Member', onChange: () => {} },
    createElement(NativeSelectOption, { value: '' }, 'Select a member'),
    createElement('option', { value: 'a' }, 'Member A')))
  expect(html).toMatch(/<button[^>]*role="combobox"/)
  expect(html).toMatch(/<button[^>]*disabled=""/)
  expect(html).toContain('Select a member')
  expect(html).toContain('id="member"')
})

test('select displays a selected option inside a native option group during server rendering', () => {
  const html = renderToStaticMarkup(createElement(NativeSelect, { value: 'member:1', 'aria-label': 'Holder', onChange: () => {} },
    createElement('option', { value: '' }, 'Select holder'),
    createElement('optgroup', { label: 'Members' }, [createElement('option', { key: '1', value: 'member:1' }, 'Ada · 001')])) )
  expect(html).toContain('Ada · 001')
  expect(html).toContain('data-value="member:1"')
})

test('a stale selection with no matching option presents a placeholder', () => {
  const html = renderToStaticMarkup(createElement(NativeSelect, { value: 'removed', 'aria-label': 'Holder', onChange: () => {} },
    createElement('option', { value: '' }, 'Select holder')))
  expect(html).toContain('Select holder')
  expect(html).toContain('data-value=""')
})
