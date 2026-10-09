import { useEffect, useState } from 'react'
import type { LonLatPoint } from '../../lib/api'
import { getRouteRisk } from '../../lib/api'
import { type RouteRiskState, type RouteSettled, RouteRiskLoader, routeRequestKey, routeRiskState } from './loaders'

export type { RouteRiskState } from './loaders'

/**
 * The risk of the route from `from` to `to` (see RouteRiskLoader): only new
 * ends or `attempt` fetch; the page reads every hour from `hourly[]`.
 */
export function useRouteRisk(from: LonLatPoint | null, to: LonLatPoint | null, hour: number, attempt: number): RouteRiskState {
  const [settled, setSettled] = useState<RouteSettled | null>(null)
  const [loader] = useState(() => new RouteRiskLoader(getRouteRisk, setSettled))

  // Every render: the loader itself ignores anything but a new request key.
  useEffect(() => {
    loader.update(from, to, hour, attempt)
  })
  useEffect(() => () => loader.dispose(), [loader])

  return routeRiskState(routeRequestKey(from, to, attempt), settled)
}
