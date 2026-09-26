import { describe, expect, it } from 'vitest'
import { applyFilters, byNewest, entryNumber, formatCount, placeName } from './registry'
import type { Incident } from './registry'

function makeIncident(overrides: Partial<Incident['properties']> & { id?: string }): Incident {
  const { id = 'mdi_homicidios-1', ...properties } = overrides
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [-78.5, -0.2] },
    properties: {
      tipo: 'homicidio',
      fecha: '2026-03-10',
      hora: '10:00',
      provincia: 'PICHINCHA',
      canton: 'QUITO',
      fuente: 'mdi_homicidios',
      confianza: 'oficial',
      ...properties,
    },
  }
}

describe('applyFilters', () => {
  const base = {
    year: 2026,
    months: [3],
    types: ['homicidio', 'sicariato'] as Incident['properties']['tipo'][],
    provincia: null,
    canton: null,
    detentions: false,
  }

  it('keeps only incidents matching type, year and month', () => {
    const incidents = [
      makeIncident({ id: 'a', tipo: 'homicidio', fecha: '2026-03-10' }),
      makeIncident({ id: 'b', tipo: 'femicidio', fecha: '2026-03-10' }),
      makeIncident({ id: 'c', tipo: 'homicidio', fecha: '2025-03-10' }),
      makeIncident({ id: 'd', tipo: 'homicidio', fecha: '2026-04-10' }),
    ]

    const result = applyFilters(incidents, base)

    expect(result.map((i) => i.id)).toEqual(['a'])
  })

  it('drops incidents without a date and filters by provincia/canton', () => {
    const incidents = [
      makeIncident({ id: 'no-date', fecha: null }),
      makeIncident({ id: 'wrong-provincia', provincia: 'GUAYAS' }),
      makeIncident({ id: 'match', provincia: 'PICHINCHA', canton: 'QUITO' }),
    ]

    const result = applyFilters(incidents, { ...base, provincia: 'PICHINCHA', canton: 'QUITO' })

    expect(result.map((i) => i.id)).toEqual(['match'])
  })
})

describe('byNewest', () => {
  it('sorts by date and time, most recent first', () => {
    const older = makeIncident({ id: 'older', fecha: '2026-01-01', hora: '08:00' })
    const newer = makeIncident({ id: 'newer', fecha: '2026-01-01', hora: '20:00' })
    const noTime = makeIncident({ id: 'no-time', fecha: '2026-01-01', hora: null })

    const sorted = [older, newer, noTime].sort(byNewest)

    expect(sorted.map((i) => i.id)).toEqual(['newer', 'older', 'no-time'])
  })
})

describe('entryNumber', () => {
  it('pads the trailing record number to 5 digits', () => {
    expect(entryNumber('mdi_homicidios-42')).toBe('00042')
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
