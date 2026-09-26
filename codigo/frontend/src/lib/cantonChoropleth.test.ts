import { describe, expect, it } from 'vitest'
import type { CantonIndicatorRow, CantonIndicatorYearTotal } from './api'
import {
  buildCantonPopupHtml,
  buildFeatureStateEntries,
  buildFillColorExpression,
  buildFillOpacityExpression,
  checkYearAvailability,
  colorForClass,
  encodeClass,
  indicatorForLayer,
  indicatorRowsToStatsRows,
  noDataMessage,
  yearTotalsToStatsRows,
} from './cantonChoropleth'

function row(overrides: Partial<CantonIndicatorRow>): CantonIndicatorRow {
  return {
    code: '0901',
    name: 'Guayaquil',
    province_code: '09',
    value: 1234,
    population: 3000000,
    rate_per_100k: 41.1,
    class: 'critico',
    ...overrides,
  }
}

describe('encodeClass', () => {
  it('passes a real class through unchanged', () => {
    expect(encodeClass('critico')).toBe('critico')
    expect(encodeClass('sin_denuncias')).toBe('sin_denuncias')
  })

  it('encodes null (no population data) as the sin_datos sentinel', () => {
    expect(encodeClass(null)).toBe('sin_datos')
  })
})

describe('colorForClass', () => {
  it('gives extorsion and siniestros distinct colors for the same class', () => {
    expect(colorForClass('extorsion', 'critico')).not.toBe(colorForClass('siniestros', 'critico'))
  })

  it('uses the same sin_datos color for both layers', () => {
    expect(colorForClass('extorsion', null)).toBe(colorForClass('siniestros', null))
  })

  it('gives every real class a color distinct from sin_datos', () => {
    const sinDatos = colorForClass('extorsion', null)
    for (const cls of ['bajo', 'moderado', 'alto', 'critico'] as const) {
      expect(colorForClass('extorsion', cls)).not.toBe(sinDatos)
    }
  })
})

describe('buildFeatureStateEntries', () => {
  it('maps each row to its feature-state entry, keyed by canton code', () => {
    const rows = [row({ code: '0901', value: 1234, rate_per_100k: 41.1, class: 'critico' })]
    expect(buildFeatureStateEntries(rows)).toEqual([
      { code: '0901', state: { value: 1234, class: 'critico', rate: 41.1 } },
    ])
  })

  it('uses -1 as the null-rate sentinel, never confusing it with a real 0', () => {
    const rows = [row({ code: '0107', value: 0, population: 3726, rate_per_100k: null, class: 'sin_denuncias' })]
    expect(buildFeatureStateEntries(rows)).toEqual([
      { code: '0107', state: { value: 0, class: 'sin_denuncias', rate: -1 } },
    ])
  })

  it('encodes a null class (missing population) as sin_datos', () => {
    const rows = [row({ code: '1801', value: 5, population: null, rate_per_100k: null, class: null })]
    expect(buildFeatureStateEntries(rows)[0].state.class).toBe('sin_datos')
  })
})

describe('buildFillColorExpression', () => {
  it('builds a match expression over feature-state class with a sin_datos fallback', () => {
    const expr = buildFillColorExpression('extorsion')
    expect(expr[0]).toBe('match')
    expect(expr[1]).toEqual(['feature-state', 'class'])
    expect(expr.at(-1)).toBe(colorForClass('extorsion', null))
  })

  it('differs between extorsion and siniestros', () => {
    expect(buildFillColorExpression('extorsion')).not.toEqual(buildFillColorExpression('siniestros'))
  })
})

describe('buildFillOpacityExpression', () => {
  it('defaults to fully transparent for a feature with no state yet', () => {
    const expr = buildFillOpacityExpression()
    expect(expr.at(-1)).toBe(0)
  })

  it('climbs monotonically from bajo to critico', () => {
    const expr = buildFillOpacityExpression() as unknown as unknown[]
    const opacityFor = (cls: string) => expr[expr.indexOf(cls) + 1] as number
    expect(opacityFor('bajo')).toBeLessThan(opacityFor('moderado'))
    expect(opacityFor('moderado')).toBeLessThan(opacityFor('alto'))
    expect(opacityFor('alto')).toBeLessThan(opacityFor('critico'))
  })
})

describe('checkYearAvailability', () => {
  it('reports data present when the year is in available_years', () => {
    expect(checkYearAvailability([2019, 2020, 2025], 2025)).toEqual({ hasData: true, latestYear: 2025 })
  })

  it('reports no data and the latest year to jump to otherwise', () => {
    expect(checkYearAvailability([2019, 2020, 2025], 2026)).toEqual({ hasData: false, latestYear: 2025 })
  })

  it('returns a null latestYear when there are no available years at all', () => {
    expect(checkYearAvailability([], 2025)).toEqual({ hasData: false, latestYear: null })
  })
})

describe('noDataMessage', () => {
  it('names the indicator and year in Spanish, plain and calm', () => {
    expect(noDataMessage('extorsion', 2027)).toBe('Sin datos de extorsión para 2027.')
    expect(noDataMessage('siniestros', 2027)).toBe('Sin datos de siniestros de tránsito para 2027.')
  })
})

describe('indicatorForLayer', () => {
  it('maps the frontend layer value to the backend indicator param unchanged', () => {
    expect(indicatorForLayer('extorsion')).toBe('extorsion')
    expect(indicatorForLayer('siniestros')).toBe('siniestros')
  })
})

describe('buildCantonPopupHtml', () => {
  it('includes the canton name, value, rate and source label', () => {
    const html = buildCantonPopupHtml('extorsion', row({ name: 'GUAYAQUIL', value: 1234, rate_per_100k: 41.1 }), 2025)
    expect(html).toContain('Guayaquil')
    expect(html).toContain('1234')
    expect(html).toContain('OECO/FGE')
    expect(html).toContain('2025')
  })

  it('shows a population-missing message instead of a rate when rate_per_100k is null', () => {
    const html = buildCantonPopupHtml('siniestros', row({ rate_per_100k: null }), 2025)
    expect(html).toContain('Sin datos de población')
    expect(html).toContain('INEC')
  })

  it('escapes HTML-significant characters in the canton name', () => {
    const html = buildCantonPopupHtml('extorsion', row({ name: '<script>' }), 2025)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('yearTotalsToStatsRows', () => {
  it('maps year totals into the generic StatsRow shape', () => {
    const years: CantonIndicatorYearTotal[] = [{ year: 2025, value: 16130, population: 18103660, rate_per_100k: 89.1 }]
    expect(yearTotalsToStatsRows(years)).toEqual([
      {
        key: '2025',
        label: '2025',
        count: 16130,
        population: 18103660,
        rate_per_100k: 89.1,
        low_population_warning: false,
      },
    ])
  })

  it('flags a low-population year without crashing on a null population', () => {
    const years: CantonIndicatorYearTotal[] = [{ year: 2019, value: 1, population: null, rate_per_100k: null }]
    const [statsRow] = yearTotalsToStatsRows(years)
    expect(statsRow.population).toBe(0)
    expect(statsRow.low_population_warning).toBe(false)
  })
})

describe('indicatorRowsToStatsRows', () => {
  it('maps indicator rows into the generic StatsRow shape, keyed by canton code', () => {
    const rows = [row({ code: '0901', name: 'Guayaquil', value: 1234, population: 3000000, rate_per_100k: 41.1 })]
    expect(indicatorRowsToStatsRows(rows)).toEqual([
      {
        key: '0901',
        label: 'Guayaquil',
        count: 1234,
        population: 3000000,
        rate_per_100k: 41.1,
        low_population_warning: false,
      },
    ])
  })

  it('flags a canton with fewer than 10,000 inhabitants', () => {
    const rows = [row({ population: 3482, rate_per_100k: 0 })]
    expect(indicatorRowsToStatsRows(rows)[0].low_population_warning).toBe(true)
  })
})
