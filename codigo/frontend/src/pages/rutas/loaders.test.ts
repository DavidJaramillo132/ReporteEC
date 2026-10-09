import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LonLatPoint, Place, PlacesSearchResponse, RouteRiskResponse } from '../../lib/api'
import { ApiError } from '../../lib/api'
import {
  DEBOUNCE_MS,
  PlaceSearchLoader,
  type PlaceSettled,
  RouteRiskLoader,
  type RouteSettled,
  placeSearchState,
  routeRequestKey,
  routeRiskState,
} from './loaders'

/** A promise the test resolves or rejects by hand, to play responses in any order. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const GYE: LonLatPoint = { lon: -79.8862, lat: -2.1894 }
const UIO: LonLatPoint = { lon: -78.4678, lat: -0.1807 }
const CUE: LonLatPoint = { lon: -79.0045, lat: -2.9001 }

function fakeResponse(tag: string): RouteRiskResponse {
  return { distance_km: tag.length } as unknown as RouteRiskResponse
}

interface Call {
  from: LonLatPoint
  to: LonLatPoint
  hour: number
  signal: AbortSignal
  reply: ReturnType<typeof deferred<RouteRiskResponse>>
}

function routeHarness() {
  const calls: Call[] = []
  const settled: RouteSettled[] = []
  const loader = new RouteRiskLoader(
    (from, to, hour, signal) => {
      const reply = deferred<RouteRiskResponse>()
      calls.push({ from, to, hour, signal, reply })
      return reply.promise
    },
    (s) => settled.push(s),
  )
  return { calls, settled, loader }
}

describe('RouteRiskLoader', () => {
  it('fetches once for a pair of ends and never for an hour-only change', async () => {
    const { calls, settled, loader } = routeHarness()
    loader.update(GYE, UIO, 20, 0)
    loader.update(GYE, UIO, 21, 0)
    loader.update(GYE, UIO, 4, 0)
    loader.update({ ...GYE }, { ...UIO }, 9, 0) // same ends, new objects
    expect(calls).toHaveLength(1)
    expect(calls[0].hour).toBe(20)

    calls[0].reply.resolve(fakeResponse('a'))
    await flush()
    expect(settled).toHaveLength(1)
    expect(routeRiskState(routeRequestKey(GYE, UIO, 0), settled[0]).status).toBe('ready')
  })

  it('aborts a superseded request and ignores its late answer', async () => {
    const { calls, settled, loader } = routeHarness()
    loader.update(GYE, UIO, 20, 0)
    loader.update(GYE, CUE, 20, 0)
    expect(calls).toHaveLength(2)
    expect(calls[0].signal.aborted).toBe(true)
    expect(calls[1].signal.aborted).toBe(false)

    // The new route answers first, then the old one arrives late.
    calls[1].reply.resolve(fakeResponse('new'))
    await flush()
    calls[0].reply.resolve(fakeResponse('old'))
    await flush()
    expect(settled).toHaveLength(1)
    expect(settled[0].key).toBe(routeRequestKey(GYE, CUE, 0))
  })

  it('never shows an old answer for the current ends, even if one is delivered', () => {
    const stale: RouteSettled = { key: routeRequestKey(GYE, UIO, 0)!, data: fakeResponse('old'), error: null }
    expect(routeRiskState(routeRequestKey(GYE, CUE, 0), stale)).toEqual({ status: 'loading' })
    expect(routeRiskState(null, stale)).toEqual({ status: 'idle' })
  })

  it('refetches the same ends on retry, and clears with no ends', async () => {
    const { calls, loader } = routeHarness()
    loader.update(GYE, UIO, 20, 0)
    loader.update(GYE, UIO, 20, 1)
    expect(calls).toHaveLength(2)
    expect(calls[0].signal.aborted).toBe(true)
    loader.update(null, UIO, 20, 1)
    expect(calls).toHaveLength(2)
    expect(calls[1].signal.aborted).toBe(true)
  })

  it('maps API errors to Spanish messages, a list-shaped 422 included', async () => {
    const { calls, settled, loader } = routeHarness()
    loader.update(GYE, UIO, 20, 0)
    calls[0].reply.reject(new ApiError('422', 422, null))
    await flush()
    expect(routeRiskState(routeRequestKey(GYE, UIO, 0), settled[0])).toEqual({
      status: 'error',
      kind: 'invalid',
      message: 'Revisa el origen, el destino y la hora.',
    })
  })

  it('restarts after dispose, as a StrictMode remount does', () => {
    const { calls, loader } = routeHarness()
    loader.update(GYE, UIO, 20, 0)
    loader.dispose()
    expect(calls[0].signal.aborted).toBe(true)
    loader.update(GYE, UIO, 20, 0)
    expect(calls).toHaveLength(2)
  })
})

describe('PlaceSearchLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function placeHarness() {
    const calls: { q: string; signal: AbortSignal; reply: ReturnType<typeof deferred<PlacesSearchResponse>> }[] = []
    const settled: PlaceSettled[] = []
    const loader = new PlaceSearchLoader(
      (q, signal) => {
        const reply = deferred<PlacesSearchResponse>()
        calls.push({ q, signal, reply })
        return reply.promise
      },
      (s) => settled.push(s),
    )
    return { calls, settled, loader }
  }

  const QUITO: Place = { code: '1701', name: 'QUITO', province_code: '17', province_name: 'PICHINCHA', lon: -78.4678, lat: -0.1807 }

  it('waits 250 ms after the last keystroke and searches once', () => {
    const { calls, loader } = placeHarness()
    loader.update('q')
    loader.update('qu')
    vi.advanceTimersByTime(DEBOUNCE_MS - 1)
    loader.update('qui')
    vi.advanceTimersByTime(DEBOUNCE_MS - 1)
    expect(calls).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(calls.map((c) => c.q)).toEqual(['qui'])
  })

  it('never searches under two letters, and trims spaces', () => {
    const { calls, loader } = placeHarness()
    loader.update('q ')
    vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    expect(calls).toHaveLength(0)
    loader.update('  qu  ')
    loader.update('qu')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(calls.map((c) => c.q)).toEqual(['qu'])
  })

  it('aborts a superseded search and ignores its late result', async () => {
    const { calls, settled, loader } = placeHarness()
    loader.update('gua')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    loader.update('qui')
    expect(calls[0].signal.aborted).toBe(true)
    vi.advanceTimersByTime(DEBOUNCE_MS)
    calls[1].reply.resolve({ query: 'qui', places: [QUITO] })
    calls[0].reply.resolve({ query: 'gua', places: [] })
    await vi.runAllTimersAsync()
    expect(settled).toEqual([{ q: 'qui', places: [QUITO] }])
    expect(placeSearchState('qui', settled[0])).toEqual({ status: 'ready', places: [QUITO] })
    expect(placeSearchState('quit', settled[0])).toEqual({ status: 'loading' })
    expect(placeSearchState('q', settled[0])).toEqual({ status: 'short' })
  })
})
