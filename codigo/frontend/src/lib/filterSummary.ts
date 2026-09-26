import type { CantonLayer, IncidentType } from './registry'
import { INCIDENT_TYPES, TYPE_LABEL } from './registry'

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
