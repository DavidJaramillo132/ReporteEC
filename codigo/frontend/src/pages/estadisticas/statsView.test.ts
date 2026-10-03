import { describe, expect, it } from 'vitest'
import type { Filters } from '../../lib/registry'
import { filtersKey, statsView } from './statsView'

const base: Filters = {
  years: [2025],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  types: ['homicidio', 'sicariato', 'femicidio', 'desaparecida'],
  province: null,
  canton: null,
  detentions: false,
  cantonLayer: 'none',
}

describe('statsView', () => {
  const loaded2025 = { filters: base }
  const live = { ...base, years: [2024, 2025] }

  it('before anything loaded, describes the live filters and is loading', () => {
    expect(statsView(null, live, null)).toEqual({ shown: live, stale: false, loading: true, failed: false })
  })

  it('while 2024,2025 loads, keeps describing the 2025 bundle it still shows', () => {
    const view = statsView(loaded2025, live, null)
    expect(view.shown.years).toEqual([2025])
    expect(view).toMatchObject({ stale: true, loading: true, failed: false })
  })

  it('after the 2024,2025 request fails, the 2025 numbers stay stale (dimmed) and keep their own captions', () => {
    const view = statsView(loaded2025, live, filtersKey(live))
    expect(view.shown.years).toEqual([2025])
    expect(view).toMatchObject({ stale: true, loading: false, failed: true })
  })

  it('once the bundle matches the live filters, nothing is stale', () => {
    expect(statsView({ filters: live }, live, null)).toEqual({ shown: live, stale: false, loading: false, failed: false })
  })

  it('a failure for an older selection does not mark the live one as failed', () => {
    const older = { ...base, years: [2023] }
    expect(statsView(loaded2025, live, filtersKey(older))).toMatchObject({ loading: true, failed: false })
  })
})

describe('filtersKey', () => {
  it('ignores map-only layers and the order of the lists', () => {
    expect(filtersKey({ ...base, detentions: true, cantonLayer: 'extorsion' })).toBe(filtersKey(base))
    expect(filtersKey({ ...base, types: ['desaparecida', 'homicidio', 'femicidio', 'sicariato'] })).toBe(filtersKey(base))
  })
})
