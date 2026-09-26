/**
 * Filters <-> query string, for `/` and `/estadisticas` (see lib/router.ts's
 * FILTERED_ROUTES and the plan at
 * .claude/plans/virtual-meandering-balloon.md). Short Spanish keys, a
 * minimal URL (a field is only ever written when it differs from the
 * current default, so the common case has no query string at all), and
 * every field falls back to `defaults` independently when absent or
 * unparsable -- one bad value never breaks the rest of the view.
 */
import type { CantonLayer, Filters, IncidentType } from './registry'
import { FIRST_YEAR, INCIDENT_TYPES } from './registry'
import { monthsForYear } from './period'

const PARAM_KEYS = ['anio', 'meses', 'tipos', 'provincia', 'canton', 'capa', 'detenidos'] as const

const CANTON_LAYERS: CantonLayer[] = ['none', 'extorsion', 'siniestros']

/** True once the query string carries at least one recognized filter param --
 * the signal that the URL should win over a saved consultation (see App.tsx
 * and the plan: "la URL gana sobre lo guardado en localStorage"). */
export function hasUrlFilters(search: string): boolean {
  const params = new URLSearchParams(search)
  return PARAM_KEYS.some((key) => params.has(key))
}

function parseMonthsRaw(raw: string | null): number[] {
  if (!raw) return []
  const months = new Set<number>()
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    const range = /^(\d{1,2})-(\d{1,2})$/.exec(trimmed)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start >= 1 && start <= 12 && end >= start && end <= 12) {
        for (let m = start; m <= end; m++) months.add(m)
      }
      continue
    }
    const month = Number(trimmed)
    if (Number.isInteger(month) && month >= 1 && month <= 12) months.add(month)
  }
  return [...months].sort((a, b) => a - b)
}

/**
 * Serializes months as `a-b` when they are a contiguous run of more than one
 * month, a bare `n` for a single month, `a,b,c` otherwise -- and omits the
 * param entirely for "every published month," the common case (see the
 * plan's examples: `1-8` or `1,3,5`).
 */
function serializeMonths(months: number[], lastMonth: number): string | null {
  const sorted = [...months].sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const isEveryPublishedMonth = sorted.length === lastMonth && sorted.every((m, i) => m === i + 1)
  if (isEveryPublishedMonth) return null
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1)
  if (contiguous && sorted.length > 1) return `${sorted[0]}-${sorted[sorted.length - 1]}`
  return sorted.join(',')
}

/**
 * Reads the filters the query string requests. `lastMonth` is the caller's
 * current data-cut knowledge (12 before `/api/meta` resolves, the real cut
 * afterwards, same two-step pattern App.tsx already uses for a year
 * switch) -- months are clamped to it via the same keep-or-fall-back-to-full
 * rule `monthsForYear` uses for that switch.
 */
export function parseFiltersFromSearch(search: string, defaults: Filters, lastMonth: number): Filters {
  const params = new URLSearchParams(search)
  const currentYear = new Date().getFullYear()

  const rawYear = params.get('anio')
  const year = (() => {
    if (!rawYear) return defaults.year
    const parsed = Number(rawYear)
    return Number.isInteger(parsed) && parsed >= FIRST_YEAR && parsed <= currentYear ? parsed : defaults.year
  })()

  const rawMonths = parseMonthsRaw(params.get('meses'))
  const months = rawMonths.length ? monthsForYear(rawMonths, 12, lastMonth) : defaults.months

  const rawTypes = params.get('tipos')
  const parsedTypes = rawTypes
    ? rawTypes.split(',').filter((t): t is IncidentType => (INCIDENT_TYPES as string[]).includes(t))
    : []
  const types = parsedTypes.length ? parsedTypes : defaults.types

  const province = params.has('provincia') ? params.get('provincia') || null : defaults.province
  const canton = params.has('canton') ? params.get('canton') || null : defaults.canton

  const rawLayer = params.get('capa')
  const cantonLayer =
    rawLayer && (CANTON_LAYERS as string[]).includes(rawLayer) ? (rawLayer as CantonLayer) : defaults.cantonLayer

  const detentions = params.has('detenidos') ? params.get('detenidos') === '1' : defaults.detentions

  return { year, months, types, province, canton, cantonLayer, detentions }
}

/** The inverse of `parseFiltersFromSearch`: a minimal query string that round-trips through it. */
export function filtersToSearch(filters: Filters, defaults: Filters, lastMonth: number): string {
  const params = new URLSearchParams()

  if (filters.year !== defaults.year) params.set('anio', String(filters.year))

  const meses = serializeMonths(filters.months, lastMonth)
  if (meses) params.set('meses', meses)

  const isDefaultTypes =
    filters.types.length === INCIDENT_TYPES.length && INCIDENT_TYPES.every((t) => filters.types.includes(t))
  if (!isDefaultTypes) params.set('tipos', filters.types.join(','))

  if (filters.province) params.set('provincia', filters.province)
  if (filters.canton) params.set('canton', filters.canton)
  if (filters.cantonLayer !== 'none') params.set('capa', filters.cantonLayer)
  if (filters.detentions) params.set('detenidos', '1')

  return params.toString()
}
