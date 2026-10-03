import type { Filters } from '../../lib/registry'

/** Identity of the filters a bundle of numbers belongs to. */
export function filtersKey(filters: Filters): string {
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b)
  return JSON.stringify([sorted(filters.years), sorted(filters.months), [...filters.types].sort(), filters.province, filters.canton])
}

export interface StatsView {
  /** The filters the page must describe: the loaded bundle's own, or the live ones before anything loaded. */
  shown: Filters
  /** True while the numbers on screen belong to another selection (loading it, or it failed). */
  stale: boolean
  /** A request for the live filters is in flight. */
  loading: boolean
  /** The request for the live filters failed. */
  failed: boolean
}

/**
 * What the page shows for the live `filters`, given the last bundle that
 * loaded and the key of the last failed request. Every label, heading and
 * chart is drawn from `shown` (the bundle's own filters), never from the live
 * selection, so numbers and their captions always belong together.
 */
export function statsView(data: { filters: Filters } | null, filters: Filters, failedKey: string | null): StatsView {
  const key = filtersKey(filters)
  const failed = failedKey === key
  const stale = data !== null && filtersKey(data.filters) !== key
  return { shown: data?.filters ?? filters, stale, loading: (data === null || stale) && !failed, failed }
}
