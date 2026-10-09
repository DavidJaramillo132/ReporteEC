import type { FilterSpecification } from 'maplibre-gl'

/** The incident types the route score counts (Global Constraints). */
export const ROUTE_INCIDENT_TYPES = ['homicidio', 'sicariato', 'femicidio'] as const

/**
 * Faint context points are drawn within this distance of the displayed
 * route. The backend's buffer is 1,000 m on highways and 200 m elsewhere;
 * one 1,000 m corridor is the honest client-side bound (it can show a few
 * urban cases the score left out, never miss one it counted).
 */
export const CORRIDOR_M = 1000

/**
 * The tile filter for the faint points: the three route types, within
 * CORRIDOR_M of the route line (MapLibre's `distance` expression, in
 * meters; checked against MapLibre 6.11 vector tiles with a real render).
 * The `map_incidents` tiles already leave out canton-level points
 * (`location_precision <> 'canton'` in the view), so only exacta and
 * aproximada remain, as the score requires.
 */
export function corridorFilter(line: [number, number][]): FilterSpecification {
  return [
    'all',
    ['match', ['get', 'type'], [...ROUTE_INCIDENT_TYPES], true, false],
    ['<=', ['distance', { type: 'LineString', coordinates: line }], CORRIDOR_M],
  ] as FilterSpecification
}
