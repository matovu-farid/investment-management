import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { Input } from '../../src/components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../src/components/ui/native-select'
import { Textarea } from '../../src/components/ui/textarea'
import { Checkbox } from '../../src/components/ui/checkbox'

test('shared text inputs and selects cannot be edited before hydration', () => {
  const input = renderToStaticMarkup(createElement(Input, { 'aria-label': 'Name' }))
  const select = renderToStaticMarkup(createElement(NativeSelect, { 'aria-label': 'Member' }, createElement(NativeSelectOption, { value: 'one' }, 'One')))
  expect(input).toMatch(/<input[^>]*disabled=""/)
  expect(select).toMatch(/<button[^>]*disabled=""/)
  expect(select).toContain('role="combobox"')
})

test('shared multiline fields and checkboxes cannot be edited before hydration', () => {
  const textarea = renderToStaticMarkup(createElement(Textarea, { 'aria-label': 'Reason' }))
  const checkbox = renderToStaticMarkup(createElement(Checkbox, { 'aria-label': 'Reviewed' }))
  expect(textarea).toMatch(/<textarea[^>]*disabled=""/)
  expect(checkbox).toMatch(/<button[^>]*disabled=""/)
})
