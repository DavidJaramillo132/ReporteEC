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
    best_hour: withScore ? 4 : null,
    hourly: h,
    blackspots: [
      {
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
      },
    ],
    low_data: !withScore,
    data_cut: '2026-08-31',
    notes: [],
  }
}

const noop = () => {}

describe('RiskPanel (server render smoke)', () => {
  it('shows the band of the chosen hour with its label, score and the honesty link', () => {
    const html = renderToStaticMarkup(<RiskPanel data={response(true)} hour={20} onHour={noop} onFocusBlackspot={noop} />)
    expect(html).toMatch(/nameplate[^>]*>Crítico</)
    expect(html).toContain('>82<')
    expect(html).toContain('Saliendo a las 20:00')
    expect(html).toContain('04:00')
    expect(html).toContain('Km 42–43')
    expect(html).toContain('href="/metodologia#riesgo-en-rutas"')
    expect(html).not.toContain('Puntaje no disponible')
  })

  it('reads another hour from hourly[] without new data', () => {
    const html = renderToStaticMarkup(<RiskPanel data={response(true)} hour={9} onHour={noop} onFocusBlackspot={noop} />)
    expect(html).toContain('Saliendo a las 09:00')
    expect(html).toMatch(/nameplate[^>]*>Precaución</)
    expect(html).not.toMatch(/nameplate[^>]*>Crítico</)
  })

  it('never shows a band without a score, and flags low data', () => {
    const html = renderToStaticMarkup(<RiskPanel data={response(false)} hour={20} onHour={noop} onFocusBlackspot={noop} />)
    expect(html).toContain('Puntaje no disponible todavía')
    expect(html).not.toContain('Saliendo a las')
    expect(html).toContain('Pocos casos cerca de esta ruta.')
    expect(html).toContain('Sin casos registrados cerca de la ruta.')
    expect(html).toContain('No incluye robos, secuestros ni siniestros de tránsito')
  })
})
