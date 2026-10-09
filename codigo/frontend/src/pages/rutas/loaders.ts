/**
 * The request logic behind the Rutas page's two hooks, kept free of React so
 * it can be tested with plain fakes (see loaders.test.ts):
 *
 * - RouteRiskLoader: one request per pair of ends (or retry). A new pair
 *   aborts the request in flight, and a late answer for an old pair is
 *   never delivered. The departure hour alone never starts a request: the
 *   response carries all 24 hours.
 * - PlaceSearchLoader: the canton search, 250 ms after the last keystroke,
 *   at least two letters, with the same abort-and-ignore rule.
 */
import type { LonLatPoint, Place, PlacesSearchResponse, RouteRiskResponse } from '../../lib/api'
import { ApiError } from '../../lib/api'
import type { RouteErrorKind } from '../../lib/routeRisk'
import { routeError, routeKey } from '../../lib/routeRisk'

// ---- route risk --------------------------------------------------------------

export type RouteRiskFetcher = (from: LonLatPoint, to: LonLatPoint, hour: number, signal: AbortSignal) => Promise<RouteRiskResponse>

export type RouteSettled =
  | { key: string; data: RouteRiskResponse; error: null }
  | { key: string; data: null; error: { kind: RouteErrorKind; message: string } }

export type RouteRiskState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: RouteRiskResponse }
  | { status: 'error'; kind: RouteErrorKind; message: string }

/** The identity of one request: the rounded ends plus the retry count. The hour is deliberately not part of it. */
export function routeRequestKey(from: LonLatPoint | null, to: LonLatPoint | null, attempt: number): string | null {
  const key = routeKey(from, to)
  return key ? `${key}#${attempt}` : null
}

/** What the page shows: a settled answer counts only while it belongs to the current request. */
export function routeRiskState(requestKey: string | null, settled: RouteSettled | null): RouteRiskState {
  if (!requestKey) return { status: 'idle' }
  if (settled?.key !== requestKey) return { status: 'loading' }
  if (settled.error === null) return { status: 'ready', data: settled.data }
  return { status: 'error', ...settled.error }
}

export class RouteRiskLoader {
  private key: string | null = null
  private controller: AbortController | null = null
  private readonly fetcher: RouteRiskFetcher
  private readonly onSettle: (settled: RouteSettled) => void

  constructor(fetcher: RouteRiskFetcher, onSettle: (settled: RouteSettled) => void) {
    this.fetcher = fetcher
    this.onSettle = onSettle
  }

  /** Call on every render with the current inputs; it starts a request only when the request key changes. */
  update(from: LonLatPoint | null, to: LonLatPoint | null, hour: number, attempt: number): void {
    const key = routeRequestKey(from, to, attempt)
    if (key === this.key) return
    this.cancel()
    this.key = key
    if (!key || !from || !to) return

    const controller = new AbortController()
    this.controller = controller
    this.fetcher(from, to, hour, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) this.onSettle({ key, data, error: null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (!(error instanceof ApiError)) console.error(error)
        const status = error instanceof ApiError ? error.status : null
        const detail = error instanceof ApiError ? error.detail : null
        this.onSettle({ key, data: null, error: routeError(status, detail) })
      })
  }

  /** Aborts the request in flight and forgets the key, so the next update starts afresh (StrictMode remounts). */
  dispose(): void {
    this.cancel()
    this.key = null
  }

  private cancel(): void {
    this.controller?.abort()
    this.controller = null
  }
}

// ---- place search ------------------------------------------------------------

export const MIN_QUERY = 2
export const DEBOUNCE_MS = 250

export type PlaceSearcher = (q: string, signal: AbortSignal) => Promise<PlacesSearchResponse>

export interface PlaceSettled {
  q: string
  /** null when the search failed. */
  places: Place[] | null
}

export type PlaceSearchState =
  | { status: 'short' }
  | { status: 'loading' }
  | { status: 'ready'; places: Place[] }
  | { status: 'error' }

export function placeSearchState(query: string, settled: PlaceSettled | null): PlaceSearchState {
  const q = query.trim()
  if (q.length < MIN_QUERY) return { status: 'short' }
  if (settled?.q !== q) return { status: 'loading' }
  return settled.places ? { status: 'ready', places: settled.places } : { status: 'error' }
}

export class PlaceSearchLoader {
  private q: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private readonly search: PlaceSearcher
  private readonly onSettle: (settled: PlaceSettled) => void
  private readonly delay: number

  constructor(search: PlaceSearcher, onSettle: (settled: PlaceSettled) => void, delay = DEBOUNCE_MS) {
    this.search = search
    this.onSettle = onSettle
    this.delay = delay
  }

  /** Call with the typed text on every render; a search runs `delay` ms after the text last changed. */
  update(query: string): void {
    const q = query.trim()
    if (q === this.q) return
    this.cancel()
    this.q = q
    if (q.length < MIN_QUERY) return
    this.timer = setTimeout(() => {
      this.timer = null
      const controller = new AbortController()
      this.controller = controller
      this.search(q, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) this.onSettle({ q, places: result.places })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          console.error(error)
          this.onSettle({ q, places: null })
        })
    }, this.delay)
  }

  dispose(): void {
    this.cancel()
    this.q = null
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.controller = null
  }
}
