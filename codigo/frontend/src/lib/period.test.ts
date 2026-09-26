import { describe, expect, it } from 'vitest'
import { lastPublishedMonth, monthsForYear } from './period'

describe('lastPublishedMonth', () => {
  it('limits only the year of the data cut', () => {
    expect(lastPublishedMonth(2026, '2026-08-31')).toBe(8)
    expect(lastPublishedMonth(2025, '2026-08-31')).toBe(12)
    expect(lastPublishedMonth(2019, '2026-08-31')).toBe(12)
  })

  it('has no months after the cut year', () => {
    expect(lastPublishedMonth(2027, '2026-08-31')).toBe(0)
  })

  it('assumes a full year when the cut is unknown', () => {
    expect(lastPublishedMonth(2025, null)).toBe(12)
  })
})

describe('monthsForYear', () => {
  it('keeps a full selection full when moving to a complete year', () => {
    const eightMonths = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(monthsForYear(eightMonths, 8, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('trims a full selection to the months the cut year has', () => {
    const year = Array.from({ length: 12 }, (_, i) => i + 1)
    expect(monthsForYear(year, 12, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('keeps a partial selection that still exists', () => {
    expect(monthsForYear([3, 11], 12, 12)).toEqual([3, 11])
    expect(monthsForYear([3, 11], 12, 8)).toEqual([3])
  })

  it('falls back to every month when nothing of the selection remains', () => {
    expect(monthsForYear([10, 11], 12, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
