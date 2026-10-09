import { useEffect, useState } from 'react'
import { searchPlaces } from '../../lib/api'
import { type PlaceSearchState, type PlaceSettled, PlaceSearchLoader, placeSearchState } from './loaders'

export { MIN_QUERY } from './loaders'

/** Canton search for the origin/destination fields (see PlaceSearchLoader): debounced, aborted when superseded. */
export function usePlaceSearch(query: string): PlaceSearchState {
  const [settled, setSettled] = useState<PlaceSettled | null>(null)
  const [loader] = useState(() => new PlaceSearchLoader(searchPlaces, setSettled))

  useEffect(() => {
    loader.update(query)
  })
  useEffect(() => () => loader.dispose(), [loader])

  return placeSearchState(query, settled)
}
