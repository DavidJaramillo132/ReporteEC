import { useEffect, useState } from 'react'
import type { CantonIndicatorRow, CantonIndicatorYearTotal, StatsRow, TimeseriesPoint } from '../../lib/api'
import { getCantonIndicators, getCantonIndicatorsSummary, getStats, getStatsTimeseries } from '../../lib/api'
import { previousYearFor } from '../../lib/period'
import { FIRST_YEAR, type Filters } from '../../lib/registry'
import { filtersKey, statsView } from './statsView'

export interface CantonIndicatorData {
  /** National total per available year. */
  summary: CantonIndicatorYearTotal[]
  /** Per-canton rows for the selected years that have data. */
  rows: CantonIndicatorRow[]
  /** The selected years the source actually has (may be empty). */
  usedYears: number[]
}

export interface StatsBundle {
  /** The filters these numbers were loaded for: every caption is drawn from them. */
  filters: Filters
  /** Every type, whatever the type filter: the filter chips count them all. */
  byType: StatsRow[]
  byPlace: StatsRow[]
  cantonRanking: StatsRow[]
  timeseries: TimeseriesPoint[]
  /** Cases and rate per selected year. */
  byYear: StatsRow[]
  /** Cases per type for each selected year; only fetched with several years. */
  typesPerYear: { year: number; rows: StatsRow[] }[]
  /** Same months of the previous year; only for a single selected year. */
  previousPeriodCount: number | null
  detentionsByYear: StatsRow[]
  detentionsByProvince: StatsRow[]
  extorsion: CantonIndicatorData
  siniestros: CantonIndicatorData
}

/**
 * Every number the Estadísticas page shows, for the current filters, in one
 * round of requests. While a new round loads (or after it fails), the
 * previous bundle stays on screen, marked stale, together with the filters it
 * belongs to; see statsView.
 */
export function useStatsData(filters: Filters) {
  const [data, setData] = useState<StatsBundle | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    const { years, months, types } = filters
    const place = { province: filters.province, canton: filters.canton }
    const previousYear = previousYearFor(years, FIRST_YEAR)

    Promise.all([
      getStats({ dimension: 'type', years, months, ...place }, signal),
      getStats({ dimension: filters.province ? 'canton' : 'province', years, months, types, ...place }, signal),
      getStats({ dimension: 'canton', years, months, types }, signal),
      getStatsTimeseries({ years, months, types, ...place }, signal),
      getStats({ dimension: 'year', years, months, types, ...place }, signal),
      years.length > 1
        ? Promise.all(years.map((year) => getStats({ dimension: 'type', years: [year], months, types, ...place }, signal)))
        : Promise.resolve([]),
      // The same months of the previous year: only for a single year, and not before FIRST_YEAR.
      previousYear !== null
        ? getStats({ dimension: 'type', years: [previousYear], months, types, ...place }, signal)
        : Promise.resolve(null),
      getStats({ dimension: 'year', layer: 'detentions', months, ...place }, signal),
      getStats({ dimension: 'province', layer: 'detentions', years, months }, signal),
      getCantonIndicatorsSummary('extorsion', signal),
      getCantonIndicators('extorsion', years, signal),
      getCantonIndicatorsSummary('siniestros', signal),
      getCantonIndicators('siniestros', years, signal),
    ])
      .then(
        ([
          byType,
          byPlace,
          cantonRanking,
          timeseries,
          byYear,
          typesPerYear,
          previousPeriod,
          detentionsByYear,
          detentionsByProvince,
          extorsionSummary,
          extorsionRanking,
          siniestrosSummary,
          siniestrosRanking,
        ]) => {
          setData({
            filters,
            byType: byType.rows,
            byPlace: byPlace.rows,
            cantonRanking: cantonRanking.rows,
            timeseries: timeseries.points,
            byYear: byYear.rows,
            typesPerYear: typesPerYear.map((response, i) => ({ year: years[i], rows: response.rows })),
            previousPeriodCount: previousPeriod ? previousPeriod.rows.reduce((sum, row) => sum + row.count, 0) : null,
            detentionsByYear: detentionsByYear.rows,
            detentionsByProvince: detentionsByProvince.rows,
            extorsion: { summary: extorsionSummary.years, rows: extorsionRanking.rows, usedYears: extorsionRanking.years },
            siniestros: { summary: siniestrosSummary.years, rows: siniestrosRanking.rows, usedYears: siniestrosRanking.years },
          })
          setFailedKey(null)
        },
      )
      .catch((error: unknown) => {
        if (!signal.aborted) {
          console.error(error)
          setFailedKey(filtersKey(filters))
        }
      })

    return () => controller.abort()
  }, [filters])

  return { data, ...statsView(data, filters, failedKey) }
}
