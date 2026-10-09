import { describe, expect, it } from 'vitest'
import { layersSummary, monthsSummary, typesSummary, yearsSummary } from './filterSummary'

describe('typesSummary', () => {
  it('says "Todos" when every type is on', () => {
    expect(typesSummary(['homicidio', 'sicariato', 'femicidio', 'desaparecida'])).toBe('Todos')
  })

  it('names a single type', () => {
    expect(typesSummary(['femicidio'])).toBe('Femicidios')
  })

  it('counts a partial selection', () => {
    expect(typesSummary(['homicidio', 'femicidio', 'desaparecida'])).toBe('3 de 4')
  })

  it('says "Ninguno" when every type is off', () => {
    expect(typesSummary([])).toBe('Ninguno')
  })
})

describe('layersSummary', () => {
  it('says "Ninguna" with nothing on', () => {
    expect(layersSummary('none', false)).toBe('Ninguna')
  })

  it('names the canton layer and adds detentions', () => {
    expect(layersSummary('extorsion', false)).toBe('Extorsión')
    expect(layersSummary('siniestros', true)).toBe('Siniestros + detenciones')
  })

  it('names detentions alone', () => {
    expect(layersSummary('none', true)).toBe('Detenciones')
  })
})

describe('yearsSummary', () => {
  const available = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

  it('names a single year', () => {
    expect(yearsSummary([2026], available)).toBe('2026')
  })

  it('says "Todos" when every available year is on', () => {
    expect(yearsSummary(available, available)).toBe('Todos')
  })

  it('collapses three or more consecutive years into a range', () => {
    expect(yearsSummary([2024, 2025, 2026], available)).toBe('2024–2026')
  })

  it('lists two or three scattered years', () => {
    expect(yearsSummary([2026, 2024], available)).toBe('2024 y 2026')
    expect(yearsSummary([2019, 2021, 2023], available)).toBe('2019, 2021 y 2023')
  })

  it('shortens four or more scattered years', () => {
    expect(yearsSummary([2019, 2021, 2023, 2025], available)).toBe('2019, 2021 +2')
  })

  it('does not call a lone available year "Todos"', () => {
    expect(yearsSummary([2026], [2026])).toBe('2026')
  })
})

describe('monthsSummary', () => {
  it('says "Todos" only when all twelve months are published and on', () => {
    expect(monthsSummary([1, 2, 3, 4, 5, 6, 7, 8], 8)).toBe('Ene–Ago')
    expect(monthsSummary([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12)).toBe('Todos')
  })

  it('abbreviates a consecutive run', () => {
    expect(monthsSummary([1, 2, 3, 4, 5, 6, 7, 8], 12)).toBe('Ene–Ago')
    expect(monthsSummary([5, 6], 12)).toBe('May–Jun')
  })

  it('names a single month in full', () => {
    expect(monthsSummary([3], 12)).toBe('Marzo')
  })

  it('counts a scattered selection', () => {
    expect(monthsSummary([1, 3, 5], 12)).toBe('3 meses')
  })
})
