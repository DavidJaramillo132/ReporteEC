import type { Feature, FeatureCollection, Point } from 'geojson'

export type IncidentType = 'homicidio' | 'sicariato' | 'femicidio' | 'desaparecida'
export type Confidence = 'oficial' | 'verificado' | 'reportado' | 'en_revision'
export type SourceId = 'mdi_homicidios' | 'mdi_desaparecidas'

export interface IncidentProperties {
  tipo: IncidentType
  fecha: string | null
  hora: string | null
  provincia: string
  canton: string
  fuente: SourceId
  confianza: Confidence
}

export type Incident = Feature<Point, IncidentProperties> & { id: string }
export type IncidentCollection = FeatureCollection<Point, IncidentProperties>

export interface RegistryMeta {
  generado: string
  periodo: { desde: string | null; hasta: string | null }
  conteos: Partial<Record<IncidentType, number>>
  detenidos_total: number
}

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
  provincia: string | null
  canton: string | null
  detentions: boolean
}

export async function loadRegistry(signal?: AbortSignal) {
  const [incidents, meta] = await Promise.all([
    fetchJson<IncidentCollection>('/data/incidentes-2026.geojson', signal),
    fetchJson<RegistryMeta>('/data/meta-2026.json', signal),
  ])
  return { incidents: incidents.features as Incident[], meta }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`)
  return (await response.json()) as T
}

export function applyFilters(incidents: Incident[], filters: Filters): Incident[] {
  const types = new Set(filters.types)
  const months = new Set(filters.months)
  return incidents.filter(({ properties: p }) => {
    if (!types.has(p.tipo)) return false
    if (filters.provincia && p.provincia !== filters.provincia) return false
    if (filters.canton && p.canton !== filters.canton) return false
    if (!p.fecha) return false
    const [year, month] = p.fecha.split('-').map(Number)
    return year === filters.year && months.has(month)
  })
}

/** Newest first; entries without a time sort after timed ones on the same day. */
export function byNewest(a: Incident, b: Incident) {
  const key = (i: Incident) => `${i.properties.fecha ?? ''}T${i.properties.hora ?? '00:00'}`
  return key(b).localeCompare(key(a))
}

/** The source row number, shown as the entry number of the registry. */
export function entryNumber(id: string) {
  return id.split('-').pop()!.padStart(5, '0')
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
