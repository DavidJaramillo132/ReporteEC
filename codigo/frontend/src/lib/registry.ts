export type IncidentType = 'homicidio' | 'sicariato' | 'femicidio' | 'desaparecida'
export type Confidence = 'oficial' | 'verificado' | 'reportado' | 'en_revision'
export type SourceId = 'mdi_homicidios' | 'mdi_desaparecidas'

export const INCIDENT_TYPES: IncidentType[] = ['homicidio', 'sicariato', 'femicidio', 'desaparecida']

export const TYPE_LABEL: Record<IncidentType, { one: string; many: string }> = {
  homicidio: { one: 'Homicidio', many: 'Homicidios' },
  sicariato: { one: 'Sicariato', many: 'Sicariatos' },
  femicidio: { one: 'Femicidio', many: 'Femicidios' },
  desaparecida: { one: 'Persona desaparecida', many: 'Personas desaparecidas' },
}

/** Hue belongs to the incident type on the map. */
export const TYPE_COLOR: Record<IncidentType, string> = {
  homicidio: '#b23b2a',
  sicariato: '#6d1f3b',
  femicidio: '#8a55bd',
  desaparecida: '#1d6f78',
}

/**
 * Confidence is drawn as mark style, never as hue:
 *   oficial      solid fill, solid ink outline
 *   verificado   solid fill, dashed ink outline
 *   reportado    hatched fill
 *   en_revision  empty fill, dashed outline
 */
export const CONFIDENCE: Record<Confidence, { label: string; meaning: string; style: string }> = {
  oficial: {
    label: 'Oficial',
    meaning: 'Publicado por una institución del Estado.',
    style: 'Marca rellena',
  },
  verificado: {
    label: 'Verificado',
    meaning: 'Confirmado por varias fuentes independientes.',
    style: 'Rellena con borde discontinuo',
  },
  reportado: {
    label: 'Reportado',
    meaning: 'Existe una fuente periodística.',
    style: 'Rayada',
  },
  en_revision: {
    label: 'En revisión',
    meaning: 'Información pendiente de verificar.',
    style: 'Vacía con borde discontinuo',
  },
}

export const CONFIDENCE_ORDER: Confidence[] = ['oficial', 'verificado', 'reportado', 'en_revision']

/** Verified against the CKAN metadata on 2026-09-22. */
export const SOURCES: Record<SourceId, { name: string; dataset: string; url: string; updated: string }> = {
  mdi_homicidios: {
    name: 'Ministerio del Interior',
    dataset: 'Homicidios Intencionales',
    url: 'https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales',
    updated: '2026-09-18',
  },
  mdi_desaparecidas: {
    name: 'Ministerio del Interior',
    dataset: 'Personas Desaparecidas',
    url: 'https://www.datosabiertos.gob.ec/dataset/personas-desaparecidas',
    updated: '2026-09-17',
  },
}

export const DETENTIONS_SOURCE = {
  name: 'Ministerio del Interior',
  dataset: 'Personas Detenidas y Aprehendidas',
  url: 'https://www.datosabiertos.gob.ec/dataset/personas-detenidas-aprehendidas',
}

export const FIRST_YEAR = 2019
export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export interface Filters {
  year: number
  months: number[]
  types: IncidentType[]
  /** DPA province code (e.g. "09"), not the name. */
  province: string | null
  /** DPA canton code (e.g. "0901"), not the name. */
  canton: string | null
  detentions: boolean
}

/** The database id, shown as the entry number of the registry. */
export function entryNumber(id: number) {
  return String(id).padStart(5, '0')
}

const numberFormat = new Intl.NumberFormat('es-EC')
export const formatCount = (n: number) => numberFormat.format(n)

const longDate = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', timeZone: 'UTC' })

export const formatLongDate = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`))
export const formatShortDate = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`)).replace('.', '')

/** Canton and province names arrive in capitals; show them in title case. */
export function placeName(name: string) {
  const lower = new Set(['de', 'del', 'la', 'las', 'los', 'y'])
  return name
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && lower.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}
