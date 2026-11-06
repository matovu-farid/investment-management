import { describe, expect, it } from 'vitest'
import { formatDate, parseDate } from '../../src/components/ui/date-picker'

describe('date picker calendar dates', () => {
  it('round trips date-only values without UTC conversion', () => {
    for (const value of ['2024-02-29', '2026-01-01', '2026-12-31']) {
      expect(formatDate(parseDate(value)!)).toBe(value)
    }
  })

  it('rejects invalid or incomplete dates', () => {
    for (const value of ['', '2023-02-29', '2026-13-01', '2026-04-31', '2026-1-01']) {
      expect(parseDate(value)).toBeUndefined()
    }
  })
})
