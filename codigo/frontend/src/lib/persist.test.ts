import { describe, expect, it } from 'vitest'
import { migrateSavedView } from './persist'

const map = { center: [-78, -1], zoom: 6 }
const rest = { months: [1, 2], types: ['homicidio'], province: null, canton: null, detentions: false, cantonLayer: 'none' }

describe('migrateSavedView', () => {
  it('turns an old single `year` into `years: [year]`', () => {
    const view = migrateSavedView({ filters: { year: 2025, ...rest }, map })
    expect(view?.filters.years).toEqual([2025])
    expect(view?.filters).not.toHaveProperty('year')
    expect(view?.map).toEqual(map)
  })

  it('keeps a saved `years` list, sorted', () => {
    expect(migrateSavedView({ filters: { years: [2025, 2024], ...rest }, map })?.filters.years).toEqual([2024, 2025])
  })

  it('discards a save without a usable year selection', () => {
    expect(migrateSavedView({ filters: { ...rest }, map })).toBeNull()
    expect(migrateSavedView({ filters: { years: [], ...rest }, map })).toBeNull()
    expect(migrateSavedView({ filters: { years: ['x'], ...rest }, map })).toBeNull()
    expect(migrateSavedView(null)).toBeNull()
  })
})
