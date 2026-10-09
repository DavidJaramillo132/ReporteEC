import { useEffect, useState } from 'react'
import type { Place } from '../../lib/api'
import { searchPlaces } from '../../lib/api'

export const MIN_QUERY = 2
const DEBOUNCE_MS = 250

export type PlaceSearchState =
  | { status: 'short' }
  | { status: 'loading' }
  | { status: 'ready'; places: Place[] }
  | { status: 'error' }

/**
 * Canton search for the origin/destination fields: waits 250 ms after the
 * last keystroke, needs at least two letters, aborts the request a newer
 * query supersedes, and only ever shows results for the current text.
 */
export function usePlaceSearch(query: string): PlaceSearchState {
  const q = query.trim()
  const [settled, setSettled] = useState<{ q: string; places: Place[] | null } | null>(null)

  useEffect(() => {
    if (q.length < MIN_QUERY) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then((result) => setSettled({ q, places: result.places }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          console.error(error)
          setSettled({ q, places: null })
        })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  if (q.length < MIN_QUERY) return { status: 'short' }
  if (settled?.q !== q) return { status: 'loading' }
  return settled.places ? { status: 'ready', places: settled.places } : { status: 'error' }
}
