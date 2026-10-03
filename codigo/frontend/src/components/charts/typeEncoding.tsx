import type { ReactNode } from 'react'
import { TYPE_ENCODING } from '../../lib/charts'
import type { TypeEncoding } from '../../lib/charts'
import type { IncidentType } from '../../lib/registry'
import { Mark } from '../Mark'

export interface TypeSeries extends TypeEncoding {
  /** The registry mark: shape backs up the ink for readers who can't tell the hues apart. */
  marker: ReactNode
}

/**
 * Ink, name and mark of an incident type, together. Spread it into a BarDatum,
 * LineSeries or LegendItem so the ink can never travel without its shape:
 * `{ ...typeSeries('homicidio'), values }`.
 */
export function typeSeries(type: IncidentType, markSize = 18): TypeSeries {
  return { ...TYPE_ENCODING[type], marker: <Mark type={type} size={markSize} /> }
}
