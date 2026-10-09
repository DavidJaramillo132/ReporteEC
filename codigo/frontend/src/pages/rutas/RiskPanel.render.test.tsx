import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HourRisk, RouteRiskResponse } from '../../lib/api'
import { RiskPanel } from './RiskPanel'

function hourly(withScore: boolean): HourRisk[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const score = withScore ? (hour === 20 ? 82 : 30) : null
    return {
      hour,
      share: 1 / 24,
      weighted_cases: 0.5,
      exposure: 0.4,
      score,
      score_available: withScore,
      band: score === null ? null : score > 75 ? 'critico' : 'precaucion',
      band_label: score === null ? null : score > 75 ? 'Crítico' : 'Precaución',
    }
  })
}

const SPOT = {
  km_from: 42,
  km_to: 43,
  lon: -79.5,
  lat: -1.8,
  weighted_cases: 3.6,
  cases: 5,
  by_type: { homicidio: 5, sicariato: 0, femicidio: 0 },
  peak_hours: [21, 20, 22],
  first_date: '2021-03-02',
  last_date: '2026-07-30',
}

/** A route with cases (so `best_hour` is set, as the schema requires), with or without a score. */
function response(withScore: boolean): RouteRiskResponse {
  const h = hourly(withScore)
  return {
    origin: { lon: -79.9, lat: -2.19 },
    destination: { lon: -78.5, lat: -0.22 },
    geometry: { type: 'LineString', coordinates: [[-79.9, -2.19], [-78.5, -0.22]] },
    distance_km: 420.4,
    duration_min: 455,
    cases: { total: 46, by_type: { homicidio: 41, sicariato: 3, femicidio: 2 }, weighted_total: 14.2, without_hour: 1 },
    selected: h[20],
    best_hour: 4,
    hourly: h,
    blackspots: [SPOT],
    low_data: !withScore,
    data_cut: '2026-08-31',
    notes: [],
  }
}

/** A route with no case at all: `best_hour` null and no blackspot, as the schema states. */
function emptyRoute(): RouteRiskResponse {
  return {
    ...response(true),
    cases: { total: 0, by_type: { homicidio: 0, sicariato: 0, femicidio: 0 }, weighted_total: 0, without_hour: 0 },
    best_hour: null,
    blackspots: [],
    low_data: true,
  }
}

const noop = () => {}
const render = (data: RouteRiskResponse, hour: number) =>
  renderToStaticMarkup(<RiskPanel data={data} hour={hour} onHour={noop} onFocusBlackspot={noop} />)

describe('RiskPanel (server render smoke)', () => {
  it('names the band of the chosen hour with its score, the best hour, blackspots and the honesty link', () => {
    const html = render(response(true), 20)
    expect(html).toContain('aria-label="Nivel para salir a las 20:00: Crítico, 82 de 100"')
    expect(html).toContain('Saliendo a las 20:00')
    expect(html).toContain('Mejor hora para salir')
    expect(html).toContain('04:00')
    expect(html).toContain('Ver esa hora')
    expect(html).toContain('Km 42–43')
    expect(html).toContain('href="/metodologia#riesgo-en-rutas"')
    expect(html).not.toContain('Puntaje no disponible')
  })

  it('reads another hour from hourly[] without new data', () => {
    const html = render(response(true), 9)
    expect(html).toContain('aria-label="Nivel para salir a las 09:00: Precaución, 30 de 100"')
    expect(html).not.toContain('Crítico, 82 de 100')
  })

  it('offers no "Ver esa hora" when the chosen hour is already the best one', () => {
    expect(render(response(true), 4)).not.toContain('Ver esa hora')
  })

  it('never shows a band without a score, and flags low data', () => {
    const html = render(response(false), 20)
    expect(html).toContain('Puntaje no disponible todavía')
    expect(html).not.toContain('Nivel para salir')
    expect(html).toContain('Casos cerca de la ruta según la hora del día')
    expect(html).toContain('Pocos casos cerca de esta ruta.')
    expect(html).toContain('No incluye robos, secuestros ni siniestros de tránsito')
  })

  it('says plainly when a route has no case at all', () => {
    const html = render(emptyRoute(), 20)
    expect(html).toContain('Sin casos registrados cerca de la ruta.')
    expect(html).toContain('No hay casos registrados cerca de esta ruta.')
    expect(html).not.toContain('Ver esa hora')
  })
})
