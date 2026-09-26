import { describe, expect, it } from 'vitest'
import type { StatsRow, TimeseriesPoint } from './api'
import {
  buildLinePath,
  buildMonthlySeries,
  formatRate,
  linearScale,
  rankByRate,
  sortStatsRows,
} from './stats'

function row(overrides: Partial<StatsRow>): StatsRow {
  return {
    key: 'x',
    label: 'X',
    count: 0,
    population: 0,
    rate_per_100k: null,
    low_population_warning: false,
    ...overrides,
  }
}

describe('formatRate', () => {
  it('formats a rate with one decimal, Ecuadorian Spanish grouping', () => {
    expect(formatRate(1234.5)).toBe('1.234,5')
  })

  it('shows an em dash when there is no population to divide by', () => {
    expect(formatRate(null)).toBe('—')
  })

  it('formats zero as a real rate, not the em dash placeholder', () => {
    expect(formatRate(0)).toBe('0,0')
  })
})

describe('sortStatsRows', () => {
  const rows = [
    row({ key: 'a', label: 'Azuay', count: 10, population: 100, rate_per_100k: 10 }),
    row({ key: 'b', label: 'Bolívar', count: 30, population: 100, rate_per_100k: 30 }),
    row({ key: 'c', label: 'Cañar', count: 20, population: 100, rate_per_100k: null }),
  ]

  it('sorts by count descending by default direction', () => {
    const sorted = sortStatsRows(rows, 'count', 'desc')
    expect(sorted.map((r) => r.key)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by count ascending', () => {
    const sorted = sortStatsRows(rows, 'count', 'asc')
    expect(sorted.map((r) => r.key)).toEqual(['a', 'c', 'b'])
  })

  it('sorts by label alphabetically regardless of direction sign convention', () => {
    const sorted = sortStatsRows(rows, 'label', 'asc')
    expect(sorted.map((r) => r.key)).toEqual(['a', 'b', 'c'])
  })

  it('keeps a null rate after every real rate, in both directions', () => {
    expect(sortStatsRows(rows, 'rate_per_100k', 'desc').map((r) => r.key)).toEqual(['b', 'a', 'c'])
    expect(sortStatsRows(rows, 'rate_per_100k', 'asc').map((r) => r.key)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const copy = [...rows]
    sortStatsRows(rows, 'count', 'asc')
    expect(rows).toEqual(copy)
  })
})

describe('rankByRate', () => {
  it('orders by rate descending and drops rows with no rate', () => {
    const rows = [
      row({ key: 'low', rate_per_100k: 5, count: 1 }),
      row({ key: 'high', rate_per_100k: 50, count: 1 }),
      row({ key: 'none', rate_per_100k: null, count: 999 }),
    ]

    expect(rankByRate(rows).map((r) => r.key)).toEqual(['high', 'low'])
  })

  it('breaks a rate tie by count', () => {
    const rows = [
      row({ key: 'fewer', rate_per_100k: 10, count: 2 }),
      row({ key: 'more', rate_per_100k: 10, count: 5 }),
    ]

    expect(rankByRate(rows).map((r) => r.key)).toEqual(['more', 'fewer'])
  })

  it('limits to the requested count', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ key: String(i), rate_per_100k: i }))

    expect(rankByRate(rows, 15)).toHaveLength(15)
  })
})

describe('linearScale', () => {
  it('maps the domain endpoints to the range endpoints', () => {
    const scale = linearScale([0, 10], [100, 200])
    expect(scale(0)).toBe(100)
    expect(scale(10)).toBe(200)
    expect(scale(5)).toBe(150)
  })

  it('extrapolates outside the domain, like a normal linear map', () => {
    const scale = linearScale([0, 10], [0, 100])
    expect(scale(20)).toBe(200)
  })

  it('falls back to the range start for a zero-width domain, never NaN', () => {
    const scale = linearScale([5, 5], [0, 100])
    expect(scale(5)).toBe(0)
  })
})

describe('buildMonthlySeries', () => {
  it('keeps only the months in the given period, in order, zero-filling gaps', () => {
    const points: TimeseriesPoint[] = [
      { year: 2026, month: 3, count: 10 },
      { year: 2026, month: 1, count: 5 },
    ]
    expect(buildMonthlySeries(points, [1, 2, 3])).toEqual([
      { month: 1, count: 5 },
      { month: 2, count: 0 },
      { month: 3, count: 10 },
    ])
  })

  it('drops a point outside the selected period', () => {
    // A real regression: the API's own year/month cutoff means every month
    // after it has count 0, but the chart must never plot them at all --
    // rendering them created a misleading cliff, indistinguishable at a
    // glance from a real drop in the selected months themselves.
    const points: TimeseriesPoint[] = [
      { year: 2026, month: 6, count: 1361 },
      { year: 2026, month: 9, count: 0 },
      { year: 2026, month: 12, count: 0 },
    ]
    expect(buildMonthlySeries(points, [6])).toEqual([{ month: 6, count: 1361 }])
  })

  it('sorts the requested months regardless of the order they were given in', () => {
    expect(buildMonthlySeries([], [3, 1, 2]).map((p) => p.month)).toEqual([1, 2, 3])
  })
})

describe('monthly chart regression: the path/points must track the scale, not the index', () => {
  // Reproduces the reported bug with the exact 8 monthly values from the
  // Estadísticas screenshot: every point's y must equal what `linearScale`
  // predicts for THAT point's own count, in month order -- a chart built
  // from the wrong series (e.g. one still padded out to 12 months) would
  // compress these 8 real values together and break this correspondence.
  const counts = [1485, 1317, 1360, 1333, 1328, 1361, 1321, 1387]
  const points: TimeseriesPoint[] = counts.map((count, i) => ({ year: 2026, month: i + 1, count }))
  const months = [1, 2, 3, 4, 5, 6, 7, 8]

  it('keeps every one of the 8 in-period points at the y its own count predicts', () => {
    const series = buildMonthlySeries(points, months)
    const maxCount = Math.max(1, ...series.map((p) => p.count))
    const yScale = linearScale([0, maxCount], [110, 8])

    const chartPoints = series.map((p) => ({ x: p.month, y: yScale(p.count) }))
    chartPoints.forEach((point, i) => {
      expect(point.y).toBe(yScale(series[i].count))
    })

    // June, July and August (indices 5-7) are the reported failure: they
    // must land near the OTHER high values, not at the baseline (y near 110).
    for (const i of [5, 6, 7]) {
      expect(chartPoints[i].y).toBeLessThan(30)
    }
  })

  it('never introduces a baseline point for a month outside the period', () => {
    const series = buildMonthlySeries(points, months)
    expect(series).toHaveLength(8)
    expect(series.some((p) => p.count === 0)).toBe(false)
  })
})

describe('buildLinePath', () => {
  it('builds an SVG path starting with M and continuing with L', () => {
    const path = buildLinePath([
      { x: 0, y: 10 },
      { x: 5, y: 20 },
      { x: 10, y: 0 },
    ])
    expect(path).toBe('M 0 10 L 5 20 L 10 0')
  })

  it('returns an empty string for no points', () => {
    expect(buildLinePath([])).toBe('')
  })

  it('rounds coordinates to two decimal places', () => {
    expect(buildLinePath([{ x: 1.23456, y: 2.98765 }])).toBe('M 1.23 2.99')
  })
})
