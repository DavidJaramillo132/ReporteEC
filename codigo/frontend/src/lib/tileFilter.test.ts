import { describe, expect, it } from 'vitest'
import type { Filters } from './registry'
import { buildTileFilter } from './tileFilter'

const base: Pick<Filters, 'years' | 'months' | 'types' | 'province' | 'canton'> = {
  years: [2026],
  months: [1, 2, 3],
  types: ['homicidio', 'sicariato'],
  province: null,
  canton: null,
}

describe('buildTileFilter', () => {
  it('matches any of several selected years with `in`', () => {
    expect(buildTileFilter({ ...base, years: [2024, 2025] })[1]).toEqual(['in', ['get', 'year'], ['literal', [2024, 2025]]])
  })

  it('filters by year, months and types, with no place clauses by default', () => {
    expect(buildTileFilter(base)).toEqual([
      'all',
      ['in', ['get', 'year'], ['literal', [2026]]],
      ['in', ['get', 'month'], ['literal', [1, 2, 3]]],
      ['in', ['get', 'type'], ['literal', ['homicidio', 'sicariato']]],
    ])
  })

  it('adds a province clause only when a province is selected', () => {
    const filter = buildTileFilter({ ...base, province: '09' })

    expect(filter.at(-1)).toEqual(['==', ['get', 'province_code'], '09'])
    expect(filter).toHaveLength(5)
  })

  it('adds a canton clause only when a canton is also selected', () => {
    const filter = buildTileFilter({ ...base, province: '09', canton: '0901' })

    expect(filter.at(-2)).toEqual(['==', ['get', 'province_code'], '09'])
    expect(filter.at(-1)).toEqual(['==', ['get', 'canton_code'], '0901'])
    expect(filter).toHaveLength(6)
  })

  it('produces a filter that never matches when no types are selected', () => {
    const filter = buildTileFilter({ ...base, types: [] })

    expect(filter).toContainEqual(['in', ['get', 'type'], ['literal', []]])
  })
})
