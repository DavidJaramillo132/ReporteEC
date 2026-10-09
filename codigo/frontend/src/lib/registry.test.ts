import { describe, expect, it } from 'vitest'
import { entryNumber, formatCompactDate, formatCount, placeName } from './registry'

describe('entryNumber', () => {
  it('pads the database id to 5 digits', () => {
    expect(entryNumber(42)).toBe('00042')
  })
})

describe('formatCount', () => {
  it('formats a count using Ecuadorian Spanish grouping', () => {
    expect(formatCount(1234)).toBe('1.234')
  })
})

describe('placeName', () => {
  it('title-cases a name while keeping connector words lowercase', () => {
    expect(placeName('SANTO DOMINGO DE LOS TSACHILAS')).toBe('Santo Domingo de los Tsachilas')
  })
})

describe('formatCompactDate', () => {
  it('reads day, short month and year without dots', () => {
    expect(formatCompactDate('2026-08-31')).toBe('31 ago 2026')
    expect(formatCompactDate('2026-01-05')).not.toContain('.')
  })
})
