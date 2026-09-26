import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { Filters } from './registry'

/**
 * MapLibre filter selecting only the `map_incidents` tile features matching
 * the current year/months/types/province/canton filters. Used on the
 * `incidents-heat` and `incidents-marks` layers via `map.setFilter`.
 *
 * bbox is deliberately not part of this: vector tiles are already spatially
 * clipped per z/x/y, so the map never needs a bounding-box filter -- only the
 * registry column's own /api/incidents fetch does.
 */
export function buildTileFilter(
  filters: Pick<Filters, 'year' | 'months' | 'types' | 'province' | 'canton'>,
): ExpressionSpecification {
  const clauses: ExpressionSpecification[] = [
    ['==', ['get', 'year'], filters.year],
    ['in', ['get', 'month'], ['literal', filters.months]],
    ['in', ['get', 'type'], ['literal', filters.types]],
  ]
  if (filters.province) clauses.push(['==', ['get', 'province_code'], filters.province])
  if (filters.canton) clauses.push(['==', ['get', 'canton_code'], filters.canton])
  return ['all', ...clauses]
}
