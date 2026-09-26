import { describe, expect, it } from 'vitest'
import { matchRoute } from './router'

describe('matchRoute', () => {
  it('matches every static route', () => {
    expect(matchRoute('/')).toBe('mapa')
    expect(matchRoute('/estadisticas')).toBe('estadisticas')
    expect(matchRoute('/metodologia')).toBe('metodologia')
    expect(matchRoute('/fuentes')).toBe('fuentes')
  })

  it('ignores a trailing slash on a non-root route', () => {
    expect(matchRoute('/estadisticas/')).toBe('estadisticas')
    expect(matchRoute('/fuentes/')).toBe('fuentes')
  })

  it('falls back to no-encontrada for an unknown path', () => {
    expect(matchRoute('/no-existe')).toBe('no-encontrada')
    expect(matchRoute('/mapa')).toBe('no-encontrada')
    expect(matchRoute('')).toBe('no-encontrada')
  })
})
