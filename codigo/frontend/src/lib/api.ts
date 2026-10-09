/**
 * Typed client for the FastAPI backend (see codigo/backend/app/modules/*).
 * The map itself never calls this: it reads Martin's vector tiles directly
 * (see TILES_URL and IncidentMap). This is for the registry column, the
 * filter selects and the meta banner.
 */

import type { Confidence, IncidentType } from './registry'

const API_URL = import.meta.env.VITE_API_URL || ''
export const TILES_URL = import.meta.env.VITE_TILES_URL || '/tiles'

export interface SourceInfo {
  slug: string
  name: string
  publisher: string
  url: string | null
  license: string | null
}

export interface Period {
  from: string | null
  to: string | null
}

export interface SourceLastRun {
  slug: string
  finished_at: string | null
}

export interface MetaResponse {
  period: Period
  counts: Record<string, number>
  sources: SourceInfo[]
  last_runs: SourceLastRun[]
  years: number[]
}

export interface AdminUnitOut {
  code: string
  name: string
  province_code: string | null
}

export interface AdminUnitsResponse {
  provinces: AdminUnitOut[]
  cantons: AdminUnitOut[]
}

export interface IncidentListItem {
  id: number
  type: IncidentType
  confidence: Confidence
  occurred_at: string
  date: string
  time: string
  province_code: string | null
  province_name: string | null
  canton_code: string | null
  canton_name: string | null
  lat: number
  lon: number
  source_slug: string
}

export interface IncidentDetail extends IncidentListItem {
  source: SourceInfo
  source_record_id: string
}

type QueryValue = string | number | boolean | null | undefined

async function fetchJson<T>(
  path: string,
  params: Record<string, QueryValue> | undefined,
  signal: AbortSignal | undefined,
): Promise<T> {
  const url = new URL(`${API_URL}/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  const response = await fetch(url, { signal })
  if (!response.ok) throw new ApiError(`${url.pathname} respondió ${response.status}`, response.status, await readDetail(response))
  return (await response.json()) as T
}

/**
 * A non-2xx response. `detail` is the message of a FastAPI HTTPException,
 * which the backend writes in Spanish for the reader; null otherwise.
 */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string | null

  constructor(message: string, status: number, detail: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    return detailMessage(await response.json())
  } catch {
    return null
  }
}

/**
 * FastAPI's `{"detail": "..."}` -> the message. A list-shaped detail is
 * pydantic's request validation, written in English for developers: it
 * yields null, so the caller shows its own Spanish message instead.
 */
export function detailMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null
  const detail = (body as { detail: unknown }).detail
  return typeof detail === 'string' ? detail.trim() || null : null
}

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return fetchJson<MetaResponse>('/meta', undefined, signal)
}

export function getAdminUnits(signal?: AbortSignal): Promise<AdminUnitsResponse> {
  return fetchJson<AdminUnitsResponse>('/admin-units', undefined, signal)
}

// GET /api/incidents (list + bbox) has no client function anymore: the
// registry column that used it was removed in the V1 UI restructuring (see
// the plan) and the list returns in V3 for citizen reports near the
// reader's location. The backend endpoint itself is untouched.

export function getIncident(id: number, signal?: AbortSignal): Promise<IncidentDetail> {
  return fetchJson<IncidentDetail>(`/incidents/${id}`, undefined, signal)
}

export type StatsDimension = 'type' | 'province' | 'canton' | 'month' | 'year'
export type StatsLayer = 'incidents' | 'detentions'

export interface StatsRow {
  key: string
  label: string
  count: number
  population: number
  rate_per_100k: number | null
  low_population_warning: boolean
}

export interface StatsResponse {
  dimension: StatsDimension
  layer: StatsLayer
  rows: StatsRow[]
}

export interface TimeseriesPoint {
  year: number
  month: number
  count: number
}

export interface TimeseriesResponse {
  layer: StatsLayer
  points: TimeseriesPoint[]
}

interface StatsQueryBase {
  /** Selected years; sent as a comma list. */
  years?: number[] | null
  months?: number[]
  types?: IncidentType[]
  province?: string | null
  canton?: string | null
  layer?: StatsLayer
  /** 'map' counts only cases the map draws (unlocated, exact location). */
  scope?: 'all' | 'map'
}

export interface StatsQuery extends StatsQueryBase {
  dimension: StatsDimension
}

function statsParams(query: StatsQueryBase) {
  return {
    years: query.years?.length ? query.years.join(',') : undefined,
    months: query.months?.length ? query.months.join(',') : undefined,
    types: query.types?.length ? query.types.join(',') : undefined,
    province: query.province,
    canton: query.canton,
    layer: query.layer,
    scope: query.scope,
  }
}

export function getStats(query: StatsQuery, signal?: AbortSignal): Promise<StatsResponse> {
  return fetchJson<StatsResponse>(
    '/stats',
    { dimension: query.dimension, ...statsParams(query) },
    signal,
  )
}

export function getStatsTimeseries(
  query: StatsQueryBase,
  signal?: AbortSignal,
): Promise<TimeseriesResponse> {
  return fetchJson<TimeseriesResponse>('/stats/timeseries', statsParams(query), signal)
}

// ---- canton indicators (extortion / traffic crashes) -----------------------

export type CantonIndicator = 'extorsion' | 'siniestros' | 'siniestros_fallecidos'

export type CantonIndicatorClass =
  | 'bajo'
  | 'moderado'
  | 'alto'
  | 'critico'
  | 'sin_denuncias'
  | 'sin_registros'
  | null

export interface CantonIndicatorRow {
  code: string
  name: string
  province_code: string
  value: number
  /** null only when value > 0 but no population figure exists for every used year. */
  population: number | null
  rate_per_100k: number | null
  class: CantonIndicatorClass
}

export interface CantonIndicatorsResponse {
  indicator: CantonIndicator
  /** The latest selected year. */
  year: number
  /** The selected years actually used (those in available_years); may be empty. */
  years: number[]
  available_years: number[]
  /** null for a year outside available_years (nothing meaningful to divide into quartiles). */
  breakpoints: { p25: number; p50: number; p75: number } | null
  rows: CantonIndicatorRow[]
}

export function getCantonIndicators(
  indicator: CantonIndicator,
  years: number[],
  signal?: AbortSignal,
): Promise<CantonIndicatorsResponse> {
  return fetchJson<CantonIndicatorsResponse>('/cantons/indicators', { indicator, years: years.join(',') }, signal)
}

export interface CantonIndicatorYearTotal {
  year: number
  value: number
  population: number | null
  rate_per_100k: number | null
}

export interface CantonIndicatorsSummaryResponse {
  indicator: CantonIndicator
  years: CantonIndicatorYearTotal[]
}

export function getCantonIndicatorsSummary(
  indicator: CantonIndicator,
  signal?: AbortSignal,
): Promise<CantonIndicatorsSummaryResponse> {
  return fetchJson<CantonIndicatorsSummaryResponse>('/cantons/indicators/summary', { indicator }, signal)
}

// ---- routes: risk by departure hour (V2) ------------------------------------

/** The three incident types the route score counts (see the backend's routing module). */
export type RouteIncidentType = 'homicidio' | 'sicariato' | 'femicidio'

/** Semáforo band key, stable across the API (see routing/scoring.py's Band). */
export type RouteBand = 'seguro' | 'precaucion' | 'riesgo_alto' | 'critico'

export interface LonLatPoint {
  lon: number
  lat: number
}

export interface RouteCases {
  total: number
  by_type: Record<RouteIncidentType, number>
  weighted_total: number
  without_hour: number
}

/** One departure hour (local time). `score`/`band` are null while `score_available` is false. */
export interface HourRisk {
  hour: number
  share: number
  weighted_cases: number
  exposure: number
  score: number | null
  score_available: boolean
  band: RouteBand | null
  band_label: string | null
}

export interface Blackspot {
  km_from: number
  km_to: number
  lon: number
  lat: number
  weighted_cases: number
  cases: number
  by_type: Record<RouteIncidentType, number>
  /** Up to 3 local hours, busiest first. */
  peak_hours: number[]
  first_date: string
  last_date: string
}

export interface RouteRiskResponse {
  origin: LonLatPoint
  destination: LonLatPoint
  /** A simplified display LineString, [lon, lat] pairs. */
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distance_km: number
  duration_min: number
  cases: RouteCases
  selected: HourRisk
  best_hour: number | null
  /** All 24 departure hours, 0 to 23. */
  hourly: HourRisk[]
  blackspots: Blackspot[]
  low_data: boolean
  data_cut: string | null
  notes: string[]
}

const lonLatParam = (point: LonLatPoint) => `${point.lon},${point.lat}`

/** GET /api/routes/risk. Errors arrive as ApiError: 422 (with a Spanish detail), 404 no route, 503 routing down or busy. */
export function getRouteRisk(
  from: LonLatPoint,
  to: LonLatPoint,
  hour: number,
  signal?: AbortSignal,
): Promise<RouteRiskResponse> {
  return fetchJson<RouteRiskResponse>('/routes/risk', { from: lonLatParam(from), to: lonLatParam(to), hour }, signal)
}

export interface Place {
  code: string
  /** Canton name, as stored (capitals). */
  name: string
  province_code: string | null
  province_name: string | null
  /** A point inside the canton (ST_PointOnSurface). */
  lon: number
  lat: number
}

export interface PlacesSearchResponse {
  query: string
  /** At most 10. */
  places: Place[]
}

/** GET /api/places/search: cantons by accent-insensitive name; `q` needs at least 2 letters. */
export function searchPlaces(q: string, signal?: AbortSignal): Promise<PlacesSearchResponse> {
  return fetchJson<PlacesSearchResponse>('/places/search', { q }, signal)
}
