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

export interface IncidentListResponse {
  total: number
  counts_by_type: Record<string, number>
  items: IncidentListItem[]
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
  if (!response.ok) throw new Error(`${url.pathname} respondió ${response.status}`)
  return (await response.json()) as T
}

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return fetchJson<MetaResponse>('/meta', undefined, signal)
}

export function getAdminUnits(signal?: AbortSignal): Promise<AdminUnitsResponse> {
  return fetchJson<AdminUnitsResponse>('/admin-units', undefined, signal)
}

export interface IncidentQuery {
  year?: number
  months?: number[]
  types?: IncidentType[]
  province?: string | null
  canton?: string | null
  bbox?: [number, number, number, number]
  limit?: number
  offset?: number
}

export function getIncidents(
  query: IncidentQuery,
  signal?: AbortSignal,
): Promise<IncidentListResponse> {
  return fetchJson<IncidentListResponse>(
    '/incidents',
    {
      year: query.year,
      months: query.months?.length ? query.months.join(',') : undefined,
      types: query.types?.length ? query.types.join(',') : undefined,
      province: query.province,
      canton: query.canton,
      bbox: query.bbox?.join(','),
      limit: query.limit,
      offset: query.offset,
    },
    signal,
  )
}

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
  year?: number | null
  months?: number[]
  types?: IncidentType[]
  province?: string | null
  canton?: string | null
  layer?: StatsLayer
}

export interface StatsQuery extends StatsQueryBase {
  dimension: StatsDimension
}

function statsParams(query: StatsQueryBase) {
  return {
    year: query.year ?? undefined,
    months: query.months?.length ? query.months.join(',') : undefined,
    types: query.types?.length ? query.types.join(',') : undefined,
    province: query.province,
    canton: query.canton,
    layer: query.layer,
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
  /** null only when value > 0 but no population figure exists for that year. */
  population: number | null
  rate_per_100k: number | null
  class: CantonIndicatorClass
}

export interface CantonIndicatorsResponse {
  indicator: CantonIndicator
  year: number
  available_years: number[]
  /** null for a year outside available_years (nothing meaningful to divide into quartiles). */
  breakpoints: { p25: number; p50: number; p75: number } | null
  rows: CantonIndicatorRow[]
}

export function getCantonIndicators(
  indicator: CantonIndicator,
  year: number,
  signal?: AbortSignal,
): Promise<CantonIndicatorsResponse> {
  return fetchJson<CantonIndicatorsResponse>('/cantons/indicators', { indicator, year }, signal)
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
