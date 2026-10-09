import { formatMonths, formatYears, isContiguousRun } from './period'
import type { CantonLayer, IncidentType } from './registry'
import { INCIDENT_TYPES, MONTHS, TYPE_LABEL } from './registry'

/** What the "Tipos" dropdown button says about the current selection. */
export function typesSummary(types: IncidentType[]): string {
  if (types.length === INCIDENT_TYPES.length) return 'Todos'
  if (types.length === 0) return 'Ninguno'
  if (types.length === 1) return TYPE_LABEL[types[0]].many
  return `${types.length} de ${INCIDENT_TYPES.length}`
}

const LAYER_NAME: Record<CantonLayer, string> = {
  none: 'Ninguna',
  extorsion: 'Extorsión',
  siniestros: 'Siniestros',
}

/** What the "Capas" dropdown button says: the canton layer, plus detentions if on. */
export function layersSummary(cantonLayer: CantonLayer, detentions: boolean): string {
  if (cantonLayer === 'none') return detentions ? 'Detenciones' : 'Ninguna'
  return detentions ? `${LAYER_NAME[cantonLayer]} + detenciones` : LAYER_NAME[cantonLayer]
}

/**
 * What the "Año" dropdown button says: «2026», «Todos» (every available year),
 * «2019–2026» (three or more consecutive), «2024 y 2026», and past three
 * scattered years the first two plus a count («2019, 2021 +2»).
 */
export function yearsSummary(years: number[], availableYears: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b)
  if (sorted.length === 0) return 'Ninguno'
  if (sorted.length === 1) return String(sorted[0])
  if (availableYears.length > 1 && availableYears.every((y) => sorted.includes(y))) return 'Todos'
  if (isContiguousRun(sorted) || sorted.length <= 3) return formatYears(sorted)
  return `${sorted[0]}, ${sorted[1]} +${sorted.length - 2}`
}

/**
 * What the "Meses" dropdown button says, given the last published month of the
 * selected years: «Todos» (every published month), «Marzo» (one), «Ene–Ago»
 * (a consecutive run), «3 meses» (anything else).
 */
export function monthsSummary(months: number[], lastMonth: number): string {
  const sorted = [...new Set(months)].sort((a, b) => a - b)
  if (sorted.length === 0) return 'Ninguno'
  // «Todos» only when the whole year is published and selected; a partial
  // year (e.g. the data cut) names its range so the reader sees it is partial.
  if (lastMonth === 12 && sorted.length === 12) return 'Todos'
  if (sorted.length === 1) {
    const name = formatMonths(sorted)
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  if (sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1)) {
    return `${MONTHS[sorted[0] - 1]}–${MONTHS[sorted[sorted.length - 1] - 1]}`
  }
  return `${sorted.length} meses`
}
