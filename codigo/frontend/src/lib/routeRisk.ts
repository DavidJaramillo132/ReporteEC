/**
 * Pure helpers for the Rutas page (`/rutas`): URL state, semáforo bands,
 * the hour -> derived-data selection, and the Spanish labels for distances,
 * durations and blackspots. No DOM, no fetch: everything here is
 * unit-tested in routeRisk.test.ts.
 */
import type { Blackspot, HourRisk, LonLatPoint, Place, RouteBand, RouteIncidentType, RouteRiskResponse } from './api'
import { formatCount, placeName } from './registry'

// ---- URL state ---------------------------------------------------------------

export interface RouteUrlState {
  from: LonLatPoint | null
  to: LonLatPoint | null
  hour: number | null
}

/** Ecuador's bounding box, Galápagos included: the same box the backend checks (routing/router.py). */
const LON_RANGE = [-92.1, -75.1] as const
const LAT_RANGE = [-5.1, 1.7] as const

/** Five decimals is about 1 m: plenty for a route end, and short in a shared link. */
export function roundCoord(value: number): number {
  const rounded = Math.round(value * 1e5) / 1e5
  return Object.is(rounded, -0) ? 0 : rounded
}

export function roundPoint(point: LonLatPoint): LonLatPoint {
  return { lon: roundCoord(point.lon), lat: roundCoord(point.lat) }
}

/** `"lon,lat"` inside Ecuador -> a rounded point; anything else -> null. */
export function parseLonLat(raw: string | null): LonLatPoint | null {
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null
  const lon = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (lon < LON_RANGE[0] || lon > LON_RANGE[1] || lat < LAT_RANGE[0] || lat > LAT_RANGE[1]) return null
  return roundPoint({ lon, lat })
}

export function formatLonLat(point: LonLatPoint): string {
  const { lon, lat } = roundPoint(point)
  return `${lon},${lat}`
}

export function parseHour(raw: string | null): number | null {
  if (raw === null || !/^\d{1,2}$/.test(raw.trim())) return null
  const hour = Number(raw)
  return hour >= 0 && hour <= 23 ? hour : null
}

/** `?desde=lon,lat&hasta=lon,lat&hora=H`; an invalid param is ignored on its own. */
export function parseRouteSearch(search: string): RouteUrlState {
  const params = new URLSearchParams(search)
  return {
    from: parseLonLat(params.get('desde')),
    to: parseLonLat(params.get('hasta')),
    hour: parseHour(params.get('hora')),
  }
}

/**
 * The inverse of `parseRouteSearch`. Commas stay literal (the values are
 * numbers only), so a shared link reads `?desde=-79.88621,-2.18942`. The
 * hour is written only once a point is chosen: an empty page has no query.
 */
export function routeToSearch(state: RouteUrlState): string {
  const parts: string[] = []
  if (state.from) parts.push(`desde=${formatLonLat(state.from)}`)
  if (state.to) parts.push(`hasta=${formatLonLat(state.to)}`)
  if ((state.from || state.to) && state.hour !== null) parts.push(`hora=${state.hour}`)
  return parts.join('&')
}

export function samePoint(a: LonLatPoint | null, b: LonLatPoint | null): boolean {
  if (!a || !b) return a === b
  return roundCoord(a.lon) === roundCoord(b.lon) && roundCoord(a.lat) === roundCoord(b.lat)
}

/** A stable key for "this exact route", used to drop stale responses. */
export function routeKey(from: LonLatPoint | null, to: LonLatPoint | null): string | null {
  return from && to ? `${formatLonLat(from)};${formatLonLat(to)}` : null
}

// ---- hours ---------------------------------------------------------------------

export const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** 7 -> «07:00». Wraps 24 to «00:00». */
export function hourLabel(hour: number): string {
  return `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`
}

/** The current hour in Ecuador (America/Guayaquil, UTC-5 all year): the default departure hour. */
export function guayaquilHour(now: Date = new Date()): number {
  const part = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Guayaquil' })
    .formatToParts(now)
    .find((p) => p.type === 'hour')
  const hour = Number(part?.value)
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : (now.getUTCHours() + 19) % 24
}

/**
 * The risk for departure `hour`, read from the response's own 24-hour list:
 * changing the hour never needs a new request. Falls back to `selected` only
 * if the list somehow lacks that hour.
 */
export function riskForHour(response: RouteRiskResponse, hour: number): HourRisk {
  return response.hourly.find((h) => h.hour === hour) ?? response.selected
}

/** The response says whether a 0-100 score exists at all (it is the same for every hour). */
export function scoreAvailable(response: RouteRiskResponse): boolean {
  return response.selected.score_available && response.hourly.every((h) => h.score_available && h.score !== null)
}

// ---- semáforo ----------------------------------------------------------------

export type BandShape = 'square' | 'triangle' | 'diamond' | 'octagon'

export interface BandInfo {
  key: RouteBand
  label: string
  /** Inclusive score range, as the methodology states it. */
  min: number
  max: number
  /** CSS custom property defined in index.css (a scoped exception, see DESIGN.md). */
  color: string
  /** Secondary encoding: the band never relies on color alone. */
  shape: BandShape
}

export const BANDS: BandInfo[] = [
  { key: 'seguro', label: 'Seguro', min: 0, max: 25, color: 'var(--color-semaforo-seguro)', shape: 'square' },
  { key: 'precaucion', label: 'Precaución', min: 26, max: 50, color: 'var(--color-semaforo-precaucion)', shape: 'triangle' },
  { key: 'riesgo_alto', label: 'Riesgo alto', min: 51, max: 75, color: 'var(--color-semaforo-riesgo-alto)', shape: 'diamond' },
  { key: 'critico', label: 'Crítico', min: 76, max: 100, color: 'var(--color-semaforo-critico)', shape: 'octagon' },
]

/** Same thresholds as the backend's `band_for`: each upper bound inclusive. */
export function bandForScore(score: number): BandInfo {
  const clamped = Math.min(100, Math.max(0, score))
  return BANDS.find((band) => clamped <= band.max) ?? BANDS[BANDS.length - 1]
}

/** The band for an hour, trusting the API's key when it sends one; null without a score. */
export function bandForHour(risk: HourRisk): BandInfo | null {
  if (!risk.score_available || risk.score === null) return null
  return BANDS.find((band) => band.key === risk.band) ?? bandForScore(risk.score)
}

// ---- figures -----------------------------------------------------------------

const oneDecimal = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1 })

/** «128 km»; one decimal under 10 km («3,4 km»). */
export function formatDistance(km: number): string {
  return km < 10 ? `${oneDecimal.format(km)} km` : `${formatCount(Math.round(km))} km`
}

/** «45 min», «2 h», «2 h 15 min». */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

const twoDecimals = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })

/** Weighted cases per km with two decimals: 0.0338 -> «0,03»; a tiny positive value reads «menos de 0,01». */
export function formatCasesPerKm(value: number): string {
  if (value > 0 && value < 0.005) return 'menos de 0,01'
  return twoDecimals.format(value)
}

/** A share (0..1) as a percentage with one decimal: 0.0421 -> «4,2 %». */
export function formatShare(share: number): string {
  return `${oneDecimal.format(share * 100)} %`
}

// ---- blackspots --------------------------------------------------------------

const TYPE_NAMES: Record<RouteIncidentType, { one: string; many: string }> = {
  homicidio: { one: 'homicidio', many: 'homicidios' },
  sicariato: { one: 'sicariato', many: 'sicariatos' },
  femicidio: { one: 'femicidio', many: 'femicidios' },
}
const TYPE_ORDER: RouteIncidentType[] = ['homicidio', 'sicariato', 'femicidio']

function formatKm(km: number): string {
  return Number.isInteger(km) ? formatCount(km) : oneDecimal.format(km)
}

/** «Km 42–43». */
export function kmRangeLabel(spot: Pick<Blackspot, 'km_from' | 'km_to'>): string {
  return `Km ${formatKm(spot.km_from)}–${formatKm(spot.km_to)}`
}

function typeCount(count: number, type: RouteIncidentType): string {
  return `${formatCount(count)} ${count === 1 ? TYPE_NAMES[type].one : TYPE_NAMES[type].many}`
}

/** «5 homicidios», or «6 muertes violentas (4 homicidios, 2 sicariatos)» with several types. */
export function casesLabel(spot: Pick<Blackspot, 'cases' | 'by_type'>): string {
  const present = TYPE_ORDER.filter((type) => (spot.by_type[type] ?? 0) > 0)
  if (present.length === 1) return typeCount(spot.by_type[present[0]], present[0])
  const total = `${formatCount(spot.cases)} ${spot.cases === 1 ? 'muerte violenta' : 'muertes violentas'}`
  if (present.length === 0) return total
  return `${total} (${present.map((type) => typeCount(spot.by_type[type], type)).join(', ')})`
}

/**
 * The peak hours as a clock window. Consecutive hours (also across midnight)
 * read as a span: [21, 20, 22] -> «la mayoría entre 20:00 y 23:00». Scattered
 * ones are listed: [2, 20] -> «sobre todo a las 02:00 y 20:00». Empty -> null.
 */
export function peakHoursLabel(peakHours: number[]): string | null {
  const hours = [...new Set(peakHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b)
  if (hours.length === 0) return null
  if (hours.length === 1) return `la mayoría hacia las ${hourLabel(hours[0])}`
  // Find a start from which every hour follows the previous one, circularly.
  const start = hours.findIndex((_, i) => hours.every((_, k) => k === 0 || hours[(i + k) % hours.length] === (hours[(i + k - 1) % hours.length] + 1) % 24))
  if (start >= 0) {
    const first = hours[start]
    const last = hours[(start + hours.length - 1) % hours.length]
    return `la mayoría entre ${hourLabel(first)} y ${hourLabel(last + 1)}`
  }
  const labels = hours.map(hourLabel)
  return `sobre todo a las ${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

/** «2021–2026», or «2024» when every case falls in one year. */
export function dateRangeLabel(spot: Pick<Blackspot, 'first_date' | 'last_date'>): string {
  const first = spot.first_date.slice(0, 4)
  const last = spot.last_date.slice(0, 4)
  return first === last ? first : `${first}–${last}`
}

/** The parts of a blackspot's card line, in reading order; the hour part is left out when no case has an hour. */
export function blackspotParts(spot: Blackspot): string[] {
  return [kmRangeLabel(spot), casesLabel(spot), peakHoursLabel(spot.peak_hours), dateRangeLabel(spot)].filter(
    (part): part is string => Boolean(part),
  )
}

/** «Km 42–43 · 5 homicidios · la mayoría entre 20:00 y 23:00 · 2021–2026». */
export function blackspotLabel(spot: Blackspot): string {
  return blackspotParts(spot).join(' · ')
}

// ---- errors ------------------------------------------------------------------

export const ROUTE_MESSAGES = {
  notFound: 'No encontramos una ruta por carretera entre esos dos puntos.',
  unavailable: 'El cálculo de rutas no está disponible en este momento.',
  invalid: 'Revisa el origen, el destino y la hora.',
  failed: 'No se pudo calcular la ruta.',
} as const

export type RouteErrorKind = 'invalid' | 'not-found' | 'unavailable' | 'failed'

/**
 * What to tell the reader for a failed request. A 422 carries the server's
 * own Spanish message (a point far from a road, the same place twice...)
 * when it is an HTTPException; a validation 422 has none (see
 * detailMessage) and reads the generic sentence. A 404 and a 503 use the
 * server's message when present (a 503 says whether routing is down or busy);
 * a 503 with no JSON body (from the proxy) reads the fixed calm sentence.
 */
export function routeError(status: number | null, detail: string | null): { kind: RouteErrorKind; message: string } {
  if (status === 422) return { kind: 'invalid', message: detail ?? ROUTE_MESSAGES.invalid }
  if (status === 404) return { kind: 'not-found', message: detail ?? ROUTE_MESSAGES.notFound }
  if (status === 503) return { kind: 'unavailable', message: detail ?? ROUTE_MESSAGES.unavailable }
  return { kind: 'failed', message: ROUTE_MESSAGES.failed }
}

// ---- 24-hour chart -----------------------------------------------------------

export interface HourColumn {
  key: string
  label: string
  value: number
  valueLabel: string
  detail?: string
  selected: boolean
}

/**
 * One column per departure hour. With a score: the 0-100 score, its band in
 * the detail. Without one: the share of the route's cases at that hour of
 * day, in percent -- never a made-up band.
 */
export function hourlyColumns(hourly: HourRisk[], selectedHour: number, withScore: boolean): HourColumn[] {
  return [...hourly]
    .sort((a, b) => a.hour - b.hour)
    .map((h) => {
      const band = withScore ? bandForHour(h) : null
      const value = withScore ? (h.score ?? 0) : Math.round(h.share * 1000) / 10
      return {
        key: String(h.hour),
        label: hourLabel(h.hour),
        value,
        valueLabel: withScore ? formatCount(value) : formatShare(h.share),
        detail: band ? band.label : undefined,
        selected: h.hour === selectedHour,
      }
    })
}

// ---- combobox ----------------------------------------------------------------

/**
 * The active option after a navigation key, wrapping at both ends; -1 means
 * none. Returns `current` for any other key or an empty list.
 */
export function nextActiveIndex(current: number, count: number, key: string): number {
  if (count <= 0) return -1
  switch (key) {
    case 'ArrowDown':
      return current < 0 || current >= count - 1 ? 0 : current + 1
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return current
  }
}

const foldName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()

/**
 * «Pastaza (Puyo)»: the canton in title case, and its cabecera when it has
 * another name. The cabecera comes from OpenStreetMap already cased
 * («Pablo VI»), so it is shown as is.
 */
export function placeTitle(place: Pick<Place, 'name' | 'seat_name'>): string {
  const name = placeName(place.name)
  const seat = place.seat_name?.trim()
  return seat && foldName(seat) !== foldName(name) ? `${name} (${seat})` : name
}

/** «Pastaza (Puyo), Pastaza»: the canton (and its cabecera, if named differently), then its province. */
export function placeLabel(place: Pick<Place, 'name' | 'province_name' | 'seat_name'>): string {
  const title = placeTitle(place)
  return place.province_name ? `${title}, ${placeName(place.province_name)}` : title
}

/** «Punto en el mapa (-2.18942, -79.88621)»: latitude first, as people read coordinates. */
export function pointLabel(point: LonLatPoint): string {
  const { lon, lat } = roundPoint(point)
  return `Punto en el mapa (${lat}, ${lon})`
}

/** The plain-Spanish limits of the score (Global Constraints); the API repeats them in `notes`. */
export const ROUTE_NOTES = [
  'El puntaje mide las muertes violentas registradas por kilómetro de la ruta (homicidios, sicariatos y femicidios). No mide todos los delitos ni el riesgo de cada persona que viaja.',
  'De noche viaja menos gente, y estas cifras no se ajustan según la cantidad de tráfico.',
  'No incluye robos, secuestros ni siniestros de tránsito, porque no existen datos con su ubicación.',
]
