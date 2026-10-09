import { describe, expect, it } from 'vitest'
import type { Blackspot, HourRisk, RouteRiskResponse } from './api'
import { detailMessage } from './api'
import {
  bandForHour,
  bandForScore,
  blackspotLabel,
  casesLabel,
  dateRangeLabel,
  formatDistance,
  formatDuration,
  guayaquilHour,
  hourLabel,
  hourlyColumns,
  kmRangeLabel,
  nextActiveIndex,
  parseLonLat,
  parseRouteSearch,
  peakHoursLabel,
  placeLabel,
  pointLabel,
  riskForHour,
  roundCoord,
  routeError,
  routeKey,
  routeToSearch,
  scoreAvailable,
} from './routeRisk'

function hourRisk(hour: number, score: number | null): HourRisk {
  return {
    hour,
    share: 1 / 24,
    weighted_cases: 1,
    exposure: hour / 10,
    score,
    score_available: score !== null,
    band: score === null ? null : bandForScore(score).key,
    band_label: score === null ? null : bandForScore(score).label,
  }
}

function response(scores: (number | null)[], selectedHour = 8): RouteRiskResponse {
  const hourly = scores.map((score, hour) => hourRisk(hour, score))
  return {
    origin: { lon: -79.9, lat: -2.19 },
    destination: { lon: -78.5, lat: -0.22 },
    geometry: { type: 'LineString', coordinates: [[-79.9, -2.19], [-78.5, -0.22]] },
    distance_km: 420.4,
    duration_min: 455,
    cases: { total: 30, by_type: { homicidio: 28, sicariato: 1, femicidio: 1 }, weighted_total: 14.2, without_hour: 0 },
    selected: hourly[selectedHour],
    best_hour: 4,
    hourly,
    blackspots: [],
    low_data: false,
    data_cut: '2026-08-31',
    notes: [],
  }
}

const SPOT: Blackspot = {
  km_from: 42,
  km_to: 43,
  lon: -79.5,
  lat: -2,
  weighted_cases: 3.4,
  cases: 5,
  by_type: { homicidio: 5, sicariato: 0, femicidio: 0 },
  peak_hours: [21, 20, 22],
  first_date: '2021-03-02',
  last_date: '2026-07-30',
}

describe('route URL state', () => {
  it('round-trips both points and the hour, rounded to 5 decimals', () => {
    const search = routeToSearch({
      from: { lon: -79.886212345, lat: -2.189421987 },
      to: { lon: -78.4678, lat: -0.1807 },
      hour: 20,
    })
    expect(search).toBe('desde=-79.88621,-2.18942&hasta=-78.4678,-0.1807&hora=20')
    expect(parseRouteSearch(`?${search}`)).toEqual({
      from: { lon: -79.88621, lat: -2.18942 },
      to: { lon: -78.4678, lat: -0.1807 },
      hour: 20,
    })
  })

  it('writes nothing for an empty page, and the hour only next to a point', () => {
    expect(routeToSearch({ from: null, to: null, hour: 7 })).toBe('')
    expect(routeToSearch({ from: { lon: -79, lat: -2 }, to: null, hour: 7 })).toBe('desde=-79,-2&hora=7')
  })

  it('ignores each invalid param on its own', () => {
    expect(parseRouteSearch('?desde=abc&hasta=-78.5,-0.2&hora=25')).toEqual({
      from: null,
      to: { lon: -78.5, lat: -0.2 },
      hour: null,
    })
    expect(parseRouteSearch('?desde=-79,-2&hora=7.5').hour).toBeNull()
    expect(parseRouteSearch('?hora=0').hour).toBe(0)
  })

  it('accepts an encoded comma', () => {
    expect(parseRouteSearch('?desde=-79.5%2C-2.1').from).toEqual({ lon: -79.5, lat: -2.1 })
  })

  it('rejects points outside Ecuador, swapped axes and malformed pairs', () => {
    expect(parseLonLat('-74.0,40.7')).toBeNull()
    expect(parseLonLat('-2.19,-79.9')).toBeNull()
    expect(parseLonLat('-79.9')).toBeNull()
    expect(parseLonLat('-79.9,-2.1,3')).toBeNull()
    expect(parseLonLat('-79.9,')).toBeNull()
    expect(parseLonLat('NaN,-2')).toBeNull()
    expect(parseLonLat('-90.3,-0.7')).toEqual({ lon: -90.3, lat: -0.7 })
  })

  it('rounds without leaving a negative zero', () => {
    expect(roundCoord(-0.000001)).toBe(0)
    expect(Object.is(roundCoord(-0.000001), -0)).toBe(false)
    expect(roundCoord(-79.8862149)).toBe(-79.88621)
    expect(roundCoord(-79.8862151)).toBe(-79.88622)
  })

  it('keys a route by its rounded ends', () => {
    expect(routeKey({ lon: -79.000001, lat: -2 }, { lon: -78, lat: -1 })).toBe('-79,-2;-78,-1')
    expect(routeKey(null, { lon: -78, lat: -1 })).toBeNull()
  })
})

describe('hours', () => {
  it('labels hours as HH:00', () => {
    expect(hourLabel(0)).toBe('00:00')
    expect(hourLabel(7)).toBe('07:00')
    expect(hourLabel(24)).toBe('00:00')
  })

  it('reads the current hour in America/Guayaquil (UTC-5)', () => {
    expect(guayaquilHour(new Date('2026-10-09T03:30:00Z'))).toBe(22)
    expect(guayaquilHour(new Date('2026-10-09T17:00:00Z'))).toBe(12)
  })
})

describe('hour -> derived data', () => {
  it('reads the chosen hour from hourly[] without a new request', () => {
    const r = response(Array.from({ length: 24 }, (_, h) => h * 4))
    expect(riskForHour(r, 20).score).toBe(80)
    expect(riskForHour(r, 3).score).toBe(12)
  })

  it('falls back to `selected` when the hour is missing', () => {
    const r = response(Array.from({ length: 24 }, (_, h) => h))
    r.hourly = r.hourly.filter((h) => h.hour !== 5)
    expect(riskForHour(r, 5)).toBe(r.selected)
  })

  it('knows when no score exists yet', () => {
    expect(scoreAvailable(response(Array.from({ length: 24 }, () => null)))).toBe(false)
    expect(scoreAvailable(response(Array.from({ length: 24 }, () => 40)))).toBe(true)
  })

  it('builds 24 columns with the selected hour flagged, scores or shares', () => {
    const r = response(Array.from({ length: 24 }, (_, h) => h * 4))
    const withScore = hourlyColumns(r.hourly, 20, true)
    expect(withScore).toHaveLength(24)
    expect(withScore[20]).toMatchObject({ label: '20:00', value: 80, valueLabel: '80', detail: 'Crítico', selected: true })
    expect(withScore.filter((c) => c.selected)).toHaveLength(1)

    const shares = hourlyColumns(response(Array.from({ length: 24 }, () => null)).hourly, 3, false)
    expect(shares[3]).toMatchObject({ value: 4.2, valueLabel: '4,2 %', detail: undefined, selected: true })
  })
})

describe('semáforo bands', () => {
  it('uses the doc thresholds, upper bounds inclusive', () => {
    expect(bandForScore(0).label).toBe('Seguro')
    expect(bandForScore(25).label).toBe('Seguro')
    expect(bandForScore(26).label).toBe('Precaución')
    expect(bandForScore(50).label).toBe('Precaución')
    expect(bandForScore(51).label).toBe('Riesgo alto')
    expect(bandForScore(75).label).toBe('Riesgo alto')
    expect(bandForScore(76).label).toBe('Crítico')
    expect(bandForScore(100).label).toBe('Crítico')
  })

  it('gives every band a distinct shape and token', () => {
    const shapes = new Set([0, 30, 60, 90].map((s) => bandForScore(s).shape))
    const colors = new Set([0, 30, 60, 90].map((s) => bandForScore(s).color))
    expect(shapes.size).toBe(4)
    expect(colors.size).toBe(4)
  })

  it('has no band without a score', () => {
    expect(bandForHour(hourRisk(3, null))).toBeNull()
    expect(bandForHour(hourRisk(3, 60))?.key).toBe('riesgo_alto')
  })
})

describe('figures', () => {
  it('formats distances and durations', () => {
    expect(formatDistance(420.4)).toBe('420 km')
    expect(formatDistance(3.44)).toBe('3,4 km')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(455)).toBe('7 h 35 min')
    expect(formatDuration(0.2)).toBe('1 min')
  })
})

describe('blackspot labels', () => {
  it('formats the full card line', () => {
    expect(blackspotLabel(SPOT)).toBe('Km 42–43 · 5 homicidios · la mayoría entre 20:00 y 23:00 · 2021–2026')
  })

  it('handles a partial last kilometre and a single year', () => {
    expect(kmRangeLabel({ km_from: 42, km_to: 42.6 })).toBe('Km 42–42,6')
    expect(dateRangeLabel({ first_date: '2024-01-01', last_date: '2024-11-03' })).toBe('2024')
  })

  it('names one type, or the total with its parts', () => {
    expect(casesLabel({ cases: 1, by_type: { homicidio: 0, sicariato: 1, femicidio: 0 } })).toBe('1 sicariato')
    expect(casesLabel({ cases: 6, by_type: { homicidio: 4, sicariato: 2, femicidio: 0 } })).toBe(
      '6 muertes violentas (4 homicidios, 2 sicariatos)',
    )
  })

  it('reads peak hours as a window, across midnight, or as a list', () => {
    expect(peakHoursLabel([23, 0, 1])).toBe('la mayoría entre 23:00 y 02:00')
    expect(peakHoursLabel([22, 23])).toBe('la mayoría entre 22:00 y 00:00')
    expect(peakHoursLabel([20, 2])).toBe('sobre todo a las 02:00 y 20:00')
    expect(peakHoursLabel([2, 20, 9])).toBe('sobre todo a las 02:00, 09:00 y 20:00')
    expect(peakHoursLabel([19])).toBe('la mayoría hacia las 19:00')
    expect(peakHoursLabel([])).toBeNull()
  })

  it('drops the hour part when no case has an hour', () => {
    expect(blackspotLabel({ ...SPOT, peak_hours: [] })).toBe('Km 42–43 · 5 homicidios · 2021–2026')
  })
})

describe('errors', () => {
  it('shows the server message for a 422 and a 404, a fixed one for a 503', () => {
    expect(routeError(422, 'El origen está a más de 2 km de una vía.')).toEqual({
      kind: 'invalid',
      message: 'El origen está a más de 2 km de una vía.',
    })
    expect(routeError(422, null).kind).toBe('invalid')
    expect(routeError(404, null).message).toBe('No encontramos una ruta por carretera entre esos dos puntos.')
    expect(routeError(503, 'otro texto').message).toBe('El cálculo de rutas no está disponible en este momento.')
    expect(routeError(null, null).kind).toBe('failed')
  })

  it("reads FastAPI's string detail and drops the English list shape", () => {
    expect(detailMessage({ detail: 'El origen y el destino son el mismo lugar.' })).toBe('El origen y el destino son el mismo lugar.')
    // pydantic's list-shaped validation detail is English: never shown to the reader.
    expect(detailMessage({ detail: [{ msg: 'Input should be less than or equal to 23' }] })).toBeNull()
    expect(routeError(422, detailMessage({ detail: [{ msg: 'Input should be…' }] })).message).toBe(
      'Revisa el origen, el destino y la hora.',
    )
    expect(detailMessage({})).toBeNull()
    expect(detailMessage(null)).toBeNull()
  })
})

describe('endpoint labels', () => {
  it('names a canton with its province, in title case', () => {
    expect(placeLabel({ name: 'DURÁN', province_name: 'GUAYAS' })).toBe('Durán, Guayas')
    expect(placeLabel({ name: 'SANTO DOMINGO', province_name: null })).toBe('Santo Domingo')
  })

  it('names a map point by its rounded coordinates, latitude first', () => {
    expect(pointLabel({ lon: -79.886212345, lat: -2.189421 })).toBe('Punto en el mapa (-2.18942, -79.88621)')
  })
})

describe('combobox navigation', () => {
  it('moves and wraps with the arrows, jumps with Home/End', () => {
    expect(nextActiveIndex(-1, 3, 'ArrowDown')).toBe(0)
    expect(nextActiveIndex(0, 3, 'ArrowDown')).toBe(1)
    expect(nextActiveIndex(2, 3, 'ArrowDown')).toBe(0)
    expect(nextActiveIndex(-1, 3, 'ArrowUp')).toBe(2)
    expect(nextActiveIndex(0, 3, 'ArrowUp')).toBe(2)
    expect(nextActiveIndex(1, 3, 'Home')).toBe(0)
    expect(nextActiveIndex(1, 3, 'End')).toBe(2)
    expect(nextActiveIndex(1, 3, 'a')).toBe(1)
    expect(nextActiveIndex(1, 0, 'ArrowDown')).toBe(-1)
  })
})
