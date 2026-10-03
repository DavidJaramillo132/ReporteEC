import { describe, expect, it } from 'vitest'
import {
  SELLO,
  SELLO_LIGHT,
  bandLayout,
  TYPE_ENCODING,
  barPath,
  columnPath,
  groupedLayout,
  isPointerFocus,
  lineTable,
  mixHex,
  nearestIndex,
  nearestSeriesIndex,
  niceScale,
  seriesByYear,
  shouldClearOnLeave,
  spreadLabels,
  tickGutter,
  tooltipPlacement,
  truncateLabel,
  yearColor,
} from './charts'

describe('yearColor', () => {
  const years = [2022, 2023, 2024, 2025]

  it('makes the newest year sello and the oldest the lightest step', () => {
    expect(yearColor(2025, years)).toBe(SELLO)
    expect(yearColor(2022, years)).toBe(SELLO_LIGHT)
  })

  it('darkens monotonically with the year', () => {
    const channel = (hex: string) => parseInt(hex.slice(1, 3), 16)
    const reds = years.map((year) => channel(yearColor(year, years)))
    expect(reds).toEqual([...reds].sort((a, b) => b - a))
    expect(new Set(reds).size).toBe(years.length)
  })

  it('is independent of the order or duplicates in the input', () => {
    expect(yearColor(2023, [2025, 2022, 2024, 2023, 2023])).toBe(yearColor(2023, years))
  })

  it('uses plain sello for a single year or a year outside the set', () => {
    expect(yearColor(2025, [2025])).toBe(SELLO)
    expect(yearColor(2019, years)).toBe(SELLO)
  })

  it('keeps a year the same colour whatever else is selected only by rank, not by value', () => {
    expect(yearColor(2024, [2023, 2024])).toBe(SELLO)
  })
})

describe('mixHex', () => {
  it('returns the ends and a midpoint', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('niceScale', () => {
  it('rounds the top up to a clean tick', () => {
    expect(niceScale(87)).toEqual({ max: 100, ticks: [0, 20, 40, 60, 80, 100] })
  })

  it('covers the maximum and starts at zero', () => {
    for (const value of [1, 7, 123, 4890, 15300, 99999]) {
      const { max, ticks } = niceScale(value)
      expect(ticks[0]).toBe(0)
      expect(max).toBeGreaterThanOrEqual(value)
      expect(ticks[ticks.length - 1]).toBe(max)
    }
  })

  it('uses evenly spaced 1/2/5 steps', () => {
    const { ticks } = niceScale(4890)
    expect(ticks).toEqual([0, 1000, 2000, 3000, 4000, 5000])
  })

  it('gives an empty or all-zero series a usable axis', () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] })
    expect(niceScale(-3).max).toBe(1)
  })

  it('does not add a spare tick when the maximum is exactly on a step', () => {
    expect(niceScale(100).max).toBe(100)
  })
})

describe('bandLayout', () => {
  it('caps the mark thickness and centres it in its band', () => {
    const layout = bandLayout(2, 400, 24)
    expect(layout.thickness).toBe(24)
    expect(layout.start(0)).toBe(88)
    expect(layout.start(1)).toBe(288)
  })

  it('leaves air between marks in a tight band', () => {
    const layout = bandLayout(10, 100, 24)
    expect(layout.thickness).toBeLessThan(layout.step)
    expect(layout.thickness).toBeGreaterThan(0)
  })
})

describe('tickGutter', () => {
  it('keeps the minimum for short labels and widens for long ones', () => {
    expect(tickGutter(['0', '500', '1.000'])).toBe(42)
    expect(tickGutter(['0', '50'], 40)).toBe(40)
    expect(tickGutter(['0', '100.000'])).toBe(56)
  })
})

describe('groupedLayout', () => {
  it('caps each column, keeps a 2px gap and centres the group in its band', () => {
    const layout = groupedLayout(2, 4, 400)
    expect(layout.column).toBe(24)
    expect(layout.groupWidth).toBe(102)
    expect(layout.columnX(0, 0)).toBe(49)
    expect(layout.columnX(0, 1)).toBe(49 + 26)
    expect(layout.columnX(1, 3)).toBe(200 + 49 + 3 * 26)
  })

  it('narrows the columns in a tight band but always leaves air between groups', () => {
    const layout = groupedLayout(8, 4, 310)
    expect(layout.column).toBeGreaterThan(1)
    expect(layout.column).toBeLessThan(24)
    expect(layout.step - layout.groupWidth).toBeGreaterThanOrEqual(8)
    // The last column of a group ends before the next group starts.
    expect(layout.columnX(0, 3) + layout.column).toBeLessThan(layout.columnX(1, 0))
  })
})

describe('nearestIndex', () => {
  it('snaps to the closest position', () => {
    expect(nearestIndex(48, [10, 50, 90])).toBe(1)
    expect(nearestIndex(-100, [10, 50, 90])).toBe(0)
    expect(nearestIndex(500, [10, 50, 90])).toBe(2)
  })

  it('returns -1 with nothing to snap to', () => {
    expect(nearestIndex(5, [])).toBe(-1)
  })
})

describe('barPath / columnPath', () => {
  it('draws a bar square at the baseline and rounded at the end', () => {
    const d = barPath(0, 10, 100, 14)
    expect(d.startsWith('M 0 10')).toBe(true)
    expect(d).toContain('Q 100 10 100 14')
    expect(d.endsWith('H 0 Z')).toBe(true)
  })

  it('shrinks the radius for a tiny bar instead of overshooting', () => {
    expect(barPath(0, 0, 2, 14)).toContain('Q 2 0 2 2')
  })

  it('draws a column from the baseline up, rounded at the top', () => {
    const d = columnPath(10, 100, 20, 50)
    expect(d.startsWith('M 10 100')).toBe(true)
    expect(d).toContain('Q 10 50 14 50')
  })

  it('draws nothing for a zero value', () => {
    expect(columnPath(10, 100, 20, 0)).toBe('')
  })
})

describe('tooltipPlacement', () => {
  it('opens right of and below an anchor in the top-left', () => {
    const p = tooltipPlacement(0.2, 0.2)
    expect(p.left).toBe('20%')
    expect(p.top).toBe('20%')
    expect(p.transform).toBe('translate(12px, 12px)')
  })

  it('flips left past the midpoint and above past 60% of the height', () => {
    expect(tooltipPlacement(0.9, 0.2).transform).toBe('translate(calc(-100% - 12px), 12px)')
    expect(tooltipPlacement(0.2, 0.9).transform).toBe('translate(12px, calc(-100% - 12px))')
  })

  it('clamps anchors outside the box', () => {
    const p = tooltipPlacement(-1, 4)
    expect(p.left).toBe('0%')
    expect(p.top).toBe('100%')
  })
})

describe('seriesByYear', () => {
  const points = [
    { year: 2025, month: 1, count: 5 },
    { year: 2025, month: 2, count: 7 },
    { year: 2024, month: 2, count: 3 },
  ]

  it('builds one ascending series per year over exactly the selected months', () => {
    const result = seriesByYear(points, [2025, 2024], [1, 2])
    expect(result.map((s) => s.year)).toEqual([2024, 2025])
    expect(result[0].values).toEqual([
      { month: 1, count: 0 },
      { month: 2, count: 3 },
    ])
    expect(result[1].values).toEqual([
      { month: 1, count: 5 },
      { month: 2, count: 7 },
    ])
  })

  it('keeps a year with no rows as zeros and ignores months outside the selection', () => {
    const result = seriesByYear(points, [2023, 2025], [2])
    expect(result[0]).toEqual({ year: 2023, values: [{ month: 2, count: 0 }] })
    expect(result[1].values).toEqual([{ month: 2, count: 7 }])
  })
})

describe('isPointerFocus / shouldClearOnLeave', () => {
  it('treats a focus right after a pointer press as pointer-caused', () => {
    expect(isPointerFocus(1000, 1200)).toBe(true)
    expect(isPointerFocus(1000, 1600)).toBe(false)
    expect(isPointerFocus(null, 1200)).toBe(false)
  })

  it('does not clear on touch pointerleave', () => {
    expect(shouldClearOnLeave('touch')).toBe(false)
    expect(shouldClearOnLeave('mouse')).toBe(true)
    expect(shouldClearOnLeave('pen')).toBe(true)
  })
})

describe('spreadLabels', () => {
  it('leaves well-separated labels alone', () => {
    expect(spreadLabels([10, 40, 80], 13)).toEqual([10, 40, 80])
  })

  it('pushes colliding labels apart and keeps the input order', () => {
    const out = spreadLabels([50, 20, 52], 13)
    expect(out[1]).toBe(20)
    expect(out[2] - out[0]).toBeGreaterThanOrEqual(13)
    expect(out[0]).toBe(50)
  })

  it('stays inside the bounds', () => {
    const out = spreadLabels([98, 99, 100], 13, 0, 100)
    expect(Math.max(...out)).toBeLessThanOrEqual(100)
    const sorted = [...out].sort((a, b) => a - b)
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(13)
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(13)
  })
})

describe('nearestSeriesIndex / truncateLabel / TYPE_ENCODING', () => {
  it('picks the closest series and ignores gaps', () => {
    expect(nearestSeriesIndex([10, 50, null], 48)).toBe(1)
    expect(nearestSeriesIndex([null, null], 5)).toBe(-1)
  })

  it('truncates only what does not fit', () => {
    expect(truncateLabel('2025', 8)).toBe('2025')
    expect(truncateLabel('Persona desaparecida', 8)).toBe('Persona…')
  })

  it('pairs each type with its ink and name', () => {
    expect(TYPE_ENCODING.homicidio).toEqual({ key: 'homicidio', label: 'Homicidio', color: '#b23b2a' })
    expect(Object.keys(TYPE_ENCODING)).toHaveLength(4)
  })
})

describe('lineTable', () => {
  const series = [
    { label: '2024', values: [1, null] },
    { label: '2025', values: [5, 6] },
  ]
  const fmt = (n: number) => `#${n}`

  it('has one column per series and em dashes for gaps', () => {
    const t = lineTable('Mes', ['Ene', 'Feb'], series, fmt)
    expect(t.headers).toEqual(['Mes', '2024', '2025'])
    expect(t.rows).toEqual([
      ['Ene', '#1', '#5'],
      ['Feb', '—', '#6'],
    ])
  })

  it('adds the rate column per series when detailFor is given', () => {
    const t = lineTable('Mes', ['Ene', 'Feb'], series, fmt, (si, i) => (si === 1 && i === 0 ? '1,5' : undefined))
    expect(t.headers).toEqual(['Mes', '2024', '2024 (tasa)', '2025', '2025 (tasa)'])
    expect(t.rows[0]).toEqual(['Ene', '#1', '—', '#5', '1,5'])
  })
})
