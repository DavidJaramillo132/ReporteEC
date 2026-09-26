import { describe, expect, it } from 'vitest'
import type { Filters } from './registry'
import { buildTileFilter } from './tileFilter'

const base: Pick<Filters, 'year' | 'months' | 'types' | 'province' | 'canton'> = {
  year: 2026,
  months: [1, 2, 3],
  types: ['homicidio', 'sicariato'],
  province: null,
  canton: null,
}

describe('buildTileFilter', () => {
  it('filters by year, months and types, with no place clauses by default', () => {
    expect(buildTileFilter(base)).toEqual([
      'all',
      ['==', ['get', 'year'], 2026],
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
