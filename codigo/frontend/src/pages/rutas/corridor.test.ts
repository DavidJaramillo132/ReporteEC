import { describe, expect, it } from 'vitest'
import { CORRIDOR_M, corridorFilter } from './corridor'

describe('corridorFilter', () => {
  it('keeps the three route types within 1 km of the displayed line', () => {
    const line: [number, number][] = [
      [-79.9, -2.19],
      [-78.5, -0.22],
    ]
    expect(CORRIDOR_M).toBe(1000)
    expect(corridorFilter(line)).toEqual([
      'all',
      ['match', ['get', 'type'], ['homicidio', 'sicariato', 'femicidio'], true, false],
      ['<=', ['distance', { type: 'LineString', coordinates: line }], 1000],
    ])
  })
})
