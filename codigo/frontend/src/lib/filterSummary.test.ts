import { describe, expect, it } from 'vitest'
import { layersSummary, typesSummary } from './filterSummary'

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
