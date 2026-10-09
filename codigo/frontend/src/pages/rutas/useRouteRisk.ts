import { useEffect, useRef, useState } from 'react'
import type { LonLatPoint, RouteRiskResponse } from '../../lib/api'
import { ApiError, getRouteRisk } from '../../lib/api'
import type { RouteErrorKind } from '../../lib/routeRisk'
import { routeError, routeKey } from '../../lib/routeRisk'

type Settled =
  | { key: string; data: RouteRiskResponse; error: null }
  | { key: string; data: null; error: { kind: RouteErrorKind; message: string } }

export type RouteRiskState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: RouteRiskResponse }
  | { status: 'error'; kind: RouteErrorKind; message: string }

/**
 * Fetches the risk of the route from `from` to `to`. Only a new pair of ends
 * (or `retry`) starts a request: the response carries all 24 departure hours,
 * so the hour is sent for the API's `selected` field and otherwise read from
 * `hourly[]` on the page. A superseded request is aborted, and a response is
 * shown only while its key still matches the current ends, so a slow answer
 * for an old route never overwrites a new one.
 */
export function useRouteRisk(from: LonLatPoint | null, to: LonLatPoint | null, hour: number, attempt: number): RouteRiskState {
  const key = routeKey(from, to)
  const requestKey = key ? `${key}#${attempt}` : null
  const [settled, setSettled] = useState<Settled | null>(null)
  const hourRef = useRef(hour)

  useEffect(() => {
    hourRef.current = hour
  }, [hour])

  useEffect(() => {
    if (!from || !to || !requestKey) return
    const controller = new AbortController()
    getRouteRisk(from, to, hourRef.current, controller.signal)
      .then((data) => setSettled({ key: requestKey, data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (!(error instanceof ApiError)) console.error(error)
        const status = error instanceof ApiError ? error.status : null
        const detail = error instanceof ApiError ? error.detail : null
        setSettled({ key: requestKey, data: null, error: routeError(status, detail) })
      })
    return () => controller.abort()
    // `requestKey` already encodes `from`, `to` and `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  if (!requestKey) return { status: 'idle' }
  if (settled?.key !== requestKey) return { status: 'loading' }
  if (settled.error === null) return { status: 'ready', data: settled.data }
  return { status: 'error', ...settled.error }
}
