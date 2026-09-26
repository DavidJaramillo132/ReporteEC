import { describe, expect, it } from 'vitest'
import type { Filters } from './registry'
import { filtersToSearch, hasUrlFilters, parseFiltersFromSearch } from './urlState'

const DEFAULTS: Filters = {
  year: 2026,
  months: [1, 2, 3, 4, 5, 6, 7, 8],
  types: ['homicidio', 'sicariato', 'femicidio', 'desaparecida'],
  province: null,
  canton: null,
  detentions: false,
  cantonLayer: 'none',
}
const LAST_MONTH = 8

describe('hasUrlFilters', () => {
  it('is false for an empty or unrelated query string', () => {
    expect(hasUrlFilters('')).toBe(false)
    expect(hasUrlFilters('?utm_source=x')).toBe(false)
  })

  it('is true once a recognized param is present', () => {
    expect(hasUrlFilters('?anio=2025')).toBe(true)
    expect(hasUrlFilters('?detenidos=1')).toBe(true)
  })
})

describe('parseFiltersFromSearch / filtersToSearch round trip', () => {
  it('round-trips a filters object with every field customized', () => {
    const filters: Filters = {
      year: 2025,
      months: [1, 3, 5],
      types: ['homicidio', 'femicidio'],
      province: '09',
      canton: '0901',
      detentions: true,
      cantonLayer: 'extorsion',
    }
    const search = filtersToSearch(filters, DEFAULTS, 12)
    expect(parseFiltersFromSearch(search, DEFAULTS, 12)).toEqual(filters)
  })

  it('round-trips a contiguous month range', () => {
    const filters: Filters = { ...DEFAULTS, months: [3, 4, 5, 6] }
    const search = filtersToSearch(filters, DEFAULTS, LAST_MONTH)
    expect(search).toContain('meses=3-6')
    expect(parseFiltersFromSearch(search, DEFAULTS, LAST_MONTH).months).toEqual([3, 4, 5, 6])
  })

  it('produces an empty query string for filters equal to the defaults', () => {
    expect(filtersToSearch(DEFAULTS, DEFAULTS, LAST_MONTH)).toBe('')
  })

  it('parses defaults back from an empty query string', () => {
    expect(parseFiltersFromSearch('', DEFAULTS, LAST_MONTH)).toEqual(DEFAULTS)
  })
})

describe('parseFiltersFromSearch invalid input', () => {
  it('falls back to the default year for a non-numeric or out-of-range year', () => {
    expect(parseFiltersFromSearch('?anio=abc', DEFAULTS, LAST_MONTH).year).toBe(DEFAULTS.year)
    expect(parseFiltersFromSearch('?anio=1900', DEFAULTS, LAST_MONTH).year).toBe(DEFAULTS.year)
    expect(parseFiltersFromSearch('?anio=3000', DEFAULTS, LAST_MONTH).year).toBe(DEFAULTS.year)
  })

  it('keeps only the recognized incident types', () => {
    expect(parseFiltersFromSearch('?tipos=basura,homicidio', DEFAULTS, LAST_MONTH).types).toEqual(['homicidio'])
  })

  it('falls back to the default types when nothing recognized remains', () => {
    expect(parseFiltersFromSearch('?tipos=basura,otra', DEFAULTS, LAST_MONTH).types).toEqual(DEFAULTS.types)
  })

  it('ignores an unknown canton layer', () => {
    expect(parseFiltersFromSearch('?capa=lo-que-sea', DEFAULTS, LAST_MONTH).cantonLayer).toBe(DEFAULTS.cantonLayer)
  })

  it('ignores an inverted or out-of-range month range', () => {
    expect(parseFiltersFromSearch('?meses=8-3', DEFAULTS, LAST_MONTH).months).toEqual(DEFAULTS.months)
    expect(parseFiltersFromSearch('?meses=13-15', DEFAULTS, LAST_MONTH).months).toEqual(DEFAULTS.months)
  })
})

describe('month clamp against the data cut', () => {
  it('clamps a full-year selection down to the published months', () => {
    expect(parseFiltersFromSearch('?meses=1-12', DEFAULTS, 8).months).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('falls back to every published month when the requested months are entirely unpublished', () => {
    expect(parseFiltersFromSearch('?meses=9-10', DEFAULTS, 8).months).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('keeps a partial selection that is still within the published months', () => {
    expect(parseFiltersFromSearch('?meses=2,4', DEFAULTS, 8).months).toEqual([2, 4])
  })
})
