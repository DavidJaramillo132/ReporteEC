import { describe, expect, it } from 'vitest'
import {
  formatMonths,
  formatPeriodLabel,
  formatYears,
  lastPublishedMonth,
  lastPublishedMonthForYears,
  monthsForYear,
  previousYearFor,
  toggleYear,
} from './period'

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

describe('lastPublishedMonthForYears', () => {
  it('uses the max over the selected years', () => {
    expect(lastPublishedMonthForYears([2026], '2026-08-31')).toBe(8)
    expect(lastPublishedMonthForYears([2025, 2026], '2026-08-31')).toBe(12)
    expect(lastPublishedMonthForYears([2019, 2025], '2026-08-31')).toBe(12)
  })

  it('has no months for an empty selection', () => {
    expect(lastPublishedMonthForYears([], '2026-08-31')).toBe(0)
  })

  it('keeps a full selection full when a complete year joins the cut year', () => {
    const last = lastPublishedMonthForYears([2025, 2026], '2026-08-31')
    expect(monthsForYear([1, 2, 3, 4, 5, 6, 7, 8], 8, last)).toHaveLength(12)
  })
})

describe('toggleYear', () => {
  it('adds a year keeping the list sorted', () => {
    expect(toggleYear([2026], 2024)).toEqual([2024, 2026])
  })

  it('removes a selected year', () => {
    expect(toggleYear([2024, 2026], 2024)).toEqual([2026])
  })

  it('ignores removing the last remaining year', () => {
    expect(toggleYear([2026], 2026)).toEqual([2026])
  })
})

describe('formatPeriodLabel', () => {
  it('names one year after its months', () => {
    expect(formatPeriodLabel([2026], [1, 2, 3, 4, 5, 6, 7, 8])).toBe('enero–agosto 2026')
  })

  it('collapses three or more consecutive years into a range', () => {
    const all = Array.from({ length: 12 }, (_, i) => i + 1)
    expect(formatPeriodLabel([2024, 2025, 2026], all)).toBe('2024–2026, enero–diciembre')
  })

  it('lists non-consecutive years', () => {
    expect(formatPeriodLabel([2019, 2021, 2023], [3])).toBe('2019, 2021 y 2023, marzo')
  })

  it('joins two years with «y» and scattered months with commas', () => {
    expect(formatYears([2024, 2025])).toBe('2024 y 2025')
    expect(formatMonths([1, 3, 5])).toBe('enero, marzo y mayo')
  })
})

describe('previousYearFor', () => {
  it('is the year before a single selected year', () => {
    expect(previousYearFor([2025], 2019)).toBe(2024)
  })

  it('is null for several years', () => {
    expect(previousYearFor([2024, 2025], 2019)).toBeNull()
  })

  it('is null before the first year', () => {
    expect(previousYearFor([2019], 2019)).toBeNull()
  })
})
