import { describe, expect, it } from 'vitest'
import type { StatsRow, TimeseriesPoint } from './api'
import {
  TREND_COLORS,
  incompleteYearNote,
  monthlyLinesByYear,
  rateBars,
  rateFor,
  rateText,
  trendColumns,
  trendLegend,
  typeBars,
  typesByYear,
  yearTotalsFor,
  yearTotalsFromRows,
} from './statsCharts'

function row(overrides: Partial<StatsRow>): StatsRow {
  return { key: 'x', label: 'X', count: 0, population: 0, rate_per_100k: null, low_population_warning: false, ...overrides }
}

describe('rateText / rateFor', () => {
  it('writes a rate per 100.000 and says so when there is no population', () => {
    expect(rateText(12.34)).toBe('12,3 por 100.000 hab.')
    expect(rateText(null)).toBe('sin dato de población')
  })

  it('divides by the population, and has no rate without one', () => {
    expect(rateFor(50, 1_000_000)).toBe(5)
    expect(rateFor(50, 0)).toBeNull()
    expect(rateFor(50, null)).toBeNull()
  })
})

describe('typeBars', () => {
  const rows = [
    row({ key: 'femicidio', count: 62, rate_per_100k: 0.34 }),
    row({ key: 'homicidio', count: 9183, rate_per_100k: 50.72 }),
    row({ key: 'desaparecida', count: 7540, rate_per_100k: 41.65 }),
  ]

  it('keeps only the selected types, highest count first, with count then rate', () => {
    const bars = typeBars(rows, ['homicidio', 'femicidio'])
    expect(bars.map((b) => b.key)).toEqual(['homicidio', 'femicidio'])
    expect(bars[0]).toMatchObject({ label: 'Homicidio', value: 9183, valueLabel: '9.183 (50,7)', detail: '50,7 por 100.000 hab.' })
  })
})

describe('rateBars', () => {
  const rows = [
    row({ key: '09', label: 'GUAYAS', count: 3456, rate_per_100k: 66.1 }),
    row({ key: '0207', label: 'LAS NAVES', count: 28, rate_per_100k: 381.06, low_population_warning: true }),
    row({ key: '90', label: 'SIN POBLACIÓN', count: 5, rate_per_100k: null }),
  ]

  it('ranks by rate, measures the bar by the rate and puts the count in the label', () => {
    const bars = rateBars(rows)
    expect(bars.map((b) => b.key)).toEqual(['0207', '09'])
    expect(bars[1]).toMatchObject({ label: 'Guayas', value: 66.1, valueLabel: '66,1 (3.456)', detail: '3.456 casos', lowPopulation: false })
  })

  it('keeps the low-population mark in the label and explains it in the detail', () => {
    const [naves] = rateBars(rows, 1, 'denuncias')
    expect(naves.valueLabel).toBe('381,1 ⚠ (28)')
    expect(naves.detail).toBe('28 denuncias · base de población pequeña en el período (menos de 10.000): la tasa es poco estable')
    expect(naves.lowPopulation).toBe(true)
  })
})

describe('yearTotalsFromRows / trendColumns / trendLegend', () => {
  const totals = yearTotalsFromRows([
    row({ key: '2025', count: 300, rate_per_100k: 1.5 }),
    row({ key: '2023', count: 100, rate_per_100k: 0.5 }),
    row({ key: '2024', count: 200, rate_per_100k: null }),
  ])

  it('orders year rows oldest first', () => {
    expect(totals.map((t) => t.year)).toEqual([2023, 2024, 2025])
  })

  it('gives the selected years the strong colour and the rest the muted one', () => {
    const columns = trendColumns(totals, [2024, 2025], TREND_COLORS.siniestros)
    expect(columns.map((c) => [c.label, c.highlighted])).toEqual([
      ['2023', false],
      ['2024', true],
      ['2025', true],
    ])
    expect(columns[0].color).toBe(TREND_COLORS.siniestros.muted)
    expect(columns[2].color).toBe(TREND_COLORS.siniestros.strong)
    expect(columns[1].detail).toBe('sin dato de población')
  })

  it('lists in the legend only the kinds of column that are drawn', () => {
    const colors = TREND_COLORS.extorsion
    expect(trendLegend(trendColumns(totals, [2024], colors), colors).map((l) => l.label)).toEqual(['Años elegidos', 'Otros años'])
    expect(trendLegend(trendColumns(totals, [2023, 2024, 2025], colors), colors).map((l) => l.label)).toEqual(['Años elegidos'])
  })
})

describe('yearTotalsFor', () => {
  it('keeps every selected year, and a year without a row has 0 cases but no rate (not 0,0)', () => {
    const totals = yearTotalsFor([row({ key: '2025', count: 300, rate_per_100k: 1.5 })], [2025, 2024])
    expect(totals).toEqual([
      { year: 2024, count: 0, rate: null },
      { year: 2025, count: 300, rate: 1.5 },
    ])
  })
})

describe('monthlyLinesByYear', () => {
  const points: TimeseriesPoint[] = [
    { year: 2025, month: 1, count: 10 },
    { year: 2025, month: 12, count: 12 },
    { year: 2026, month: 1, count: 20 },
    { year: 2026, month: 8, count: 25 },
  ]

  it('builds one line per year, oldest first, over the selected months in order', () => {
    const lines = monthlyLinesByYear(points, [2026, 2025], [12, 1, 2], '2026-08-31')
    expect(lines.map((l) => l.year)).toEqual([2025, 2026])
    expect(lines[0].values).toEqual([10, 0, 12])
  })

  it('leaves a gap (not a zero) after the data cut, and keeps real zeros before it', () => {
    const [line2026] = monthlyLinesByYear(points, [2026], [1, 2, 8, 9, 12], '2026-08-31')
    expect(line2026.values).toEqual([20, 0, 25, null, null])
  })
})

describe('typesByYear', () => {
  it('builds one group per year with the selected types in the registry order', () => {
    const { types, groups } = typesByYear(
      [
        { year: 2025, rows: [row({ key: 'desaparecida', count: 7, population: 1_000_000, rate_per_100k: 0.7 }), row({ key: 'homicidio', count: 9, population: 1_000_000, rate_per_100k: 0.9 })] },
        { year: 2024, rows: [row({ key: 'homicidio', count: 5, population: 900_000, rate_per_100k: 0.56 })] },
      ],
      ['desaparecida', 'femicidio', 'homicidio'],
    )
    expect(types).toEqual(['homicidio', 'femicidio', 'desaparecida'])
    expect(groups.map((g) => g.label)).toEqual(['2024', '2025'])
    expect(groups[1].values).toEqual([9, 0, 7])
    // A type with no rows is a real zero, rated against the year's shared population.
    expect(groups[1].details).toEqual(['0,9 por 100.000 hab.', '0,0 por 100.000 hab.', '0,7 por 100.000 hab.'])
  })
})

describe('incompleteYearNote', () => {
  it('names the cut year when the months reach past its last published month', () => {
    expect(incompleteYearNote([2025, 2026], [1, 2, 3, 9], '2026-08-31')).toBe(
      '2026 llega solo hasta agosto: su total no cubre todos los meses elegidos.',
    )
  })

  it('says nothing when every year covers the selected months', () => {
    expect(incompleteYearNote([2025, 2026], [1, 2, 8], '2026-08-31')).toBeNull()
    expect(incompleteYearNote([2024, 2025], [1, 12], '2026-08-31')).toBeNull()
  })
})
