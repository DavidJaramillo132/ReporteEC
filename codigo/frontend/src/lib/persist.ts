import type { MapView } from '../components/IncidentMap'
import type { Filters } from './registry'

/**
 * The last consultation, restored on return. Browser storage may be
 * unavailable. No longer saves a selected incident id: the case card (see
 * components/IncidentCard.tsx) is opened only by clicking a mark, and
 * nothing restores that click across a reload.
 */
export interface SavedView {
  filters: Filters
  map: MapView
}

const KEY = 'reporteec:consulta:v1'

/**
 * Older saves carry `filters.year: number`; they become `years: [year]`.
 * Anything without a usable year selection is discarded.
 */
export function migrateSavedView(value: unknown): SavedView | null {
  if (typeof value !== 'object' || value === null) return null
  const view = value as { filters?: Record<string, unknown>; map?: MapView }
  const filters = view.filters
  if (!filters || typeof filters !== 'object') return null
  const { year, years, ...rest } = filters
  let migrated: number[] | null = null
  if (Array.isArray(years) && years.length > 0 && years.every((y) => Number.isInteger(y))) {
    migrated = [...(years as number[])].sort((a, b) => a - b)
  } else if (typeof year === 'number' && Number.isInteger(year)) {
    migrated = [year]
  }
  if (!migrated) return null
  return { ...view, filters: { ...rest, years: migrated } } as SavedView
}

export function loadSavedView(): SavedView | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? migrateSavedView(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveView(view: SavedView) {
  try {
    localStorage.setItem(KEY, JSON.stringify(view))
  } catch {
    // Private mode or blocked storage: the page works without it.
  }
}

export function clearSavedView() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
