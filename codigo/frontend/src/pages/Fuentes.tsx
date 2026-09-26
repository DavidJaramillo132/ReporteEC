import type { ReactNode } from 'react'
import { useEffect } from 'react'
import type { MetaResponse } from '../lib/api'
import { DETENTIONS_SOURCE, SOURCES, formatLongDate } from '../lib/registry'

interface TocEntry {
  id: string
  title: string
}

const TOC: TocEntry[] = [
  { id: 'conjuntos-de-datos', title: 'Conjuntos de datos' },
  { id: 'tu-ubicacion', title: 'Tu ubicación' },
  { id: 'mapa-base', title: 'Mapa base' },
  { id: 'condiciones-de-uso', title: 'Condiciones de uso' },
  { id: 'aviso-de-responsabilidad', title: 'Aviso de responsabilidad' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-b border-rule-soft py-6 last:border-b-0">
      <h2 id={`${id}-title`} className="text-[19px] leading-snug font-semibold">
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-[14.5px] text-ink-2">{children}</div>
    </section>
  )
}

interface SourceEntry {
  key: string
  dataset: string
  publisher: string
  url: string | null
  license: string | null
  note: string
  updatedNote: string | null
}

const STATIC_SOURCES: { slug: string; dataset: string; publisher: string; url: string; license: string; note: string }[] = [
  {
    slug: 'mdi-homicidios',
    dataset: 'Homicidios Intencionales',
    publisher: 'Ministerio del Interior',
    url: SOURCES.mdi_homicidios.url,
    license: 'Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)',
    note: 'Puntos y mapa de calor.',
  },
  {
    slug: 'mdi-desaparecidas',
    dataset: 'Personas Desaparecidas',
    publisher: 'Ministerio del Interior',
    url: SOURCES.mdi_desaparecidas.url,
    license: 'Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)',
    note: 'Puntos y mapa de calor; las personas localizadas se retiran del mapa.',
  },
  {
    slug: 'mdi-detenidos',
    dataset: DETENTIONS_SOURCE.dataset,
    publisher: 'Ministerio del Interior',
    url: DETENTIONS_SOURCE.url,
    license: 'Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)',
    note: 'Capa aparte de actividad policial, agregada en celdas de unos 100 metros.',
  },
  {
    slug: 'oeco-noticias-delito',
    dataset: 'Estadística de Noticias de Delito relacionados a Crimen Organizado',
    publisher: 'Observatorio Ecuatoriano de Crimen Organizado (OECO) / PADF, datos originales de la Fiscalía',
    url: 'https://visualizador-oeco.up.railway.app/descargas',
    license: 'consultar condiciones de uso del OECO',
    note: 'Denuncias de extorsión, por cantón. La descarga exige un formulario de registro previo.',
  },
  {
    slug: 'inec-estra',
    dataset: 'Estadísticas de Transporte (ESTRA) — siniestros de tránsito',
    publisher: 'Instituto Nacional de Estadística y Censos (INEC)',
    url: 'https://www.ecuadorencifras.gob.ec/siniestros-transito-trimestral/',
    license: 'datos públicos INEC',
    note: 'Siniestros de tránsito, por cantón: la fuente no publica coordenadas.',
  },
]

function buildSources(meta: MetaResponse | null): SourceEntry[] {
  return STATIC_SOURCES.map((s) => {
    const live = meta?.sources.find((m) => m.slug === s.slug)
    const lastRun = meta?.last_runs.find((r) => r.slug === s.slug)?.finished_at ?? null
    return {
      key: s.slug,
      dataset: s.dataset,
      publisher: live?.publisher ?? s.publisher,
      url: live?.url ?? s.url,
      license: live?.license ?? s.license,
      note: s.note,
      updatedNote: lastRun ? `Última actualización de la ingesta: ${formatLongDate(lastRun.slice(0, 10))}` : null,
    }
  })
}

/** Not tied to any ingestion pipeline (no periodic runs), so always shown from static text. */
const EXTRA_SOURCES: SourceEntry[] = [
  {
    key: 'inec-poblacion',
    dataset: 'Proyección de la Población Ecuatoriana por años calendario, según cantones, 2010–2035',
    publisher: 'Instituto Nacional de Estadística y Censos (INEC)',
    url: 'https://www.ecuadorencifras.gob.ec/',
    license: 'datos públicos INEC',
    note: 'Población por cantón; se usa solo para calcular tasas, nunca se muestra por sí sola.',
    updatedNote: null,
  },
  {
    key: 'geoboundaries',
    dataset: 'geoBoundaries — límites administrativos de Ecuador (provincias y cantones)',
    publisher: 'geoBoundaries.org',
    url: 'https://www.geoboundaries.org',
    license: 'CC BY 4.0 — ver licencia en geoBoundaries',
    note: 'Los contornos de provincias y cantones dibujados en el mapa; no trae casos ni cifras.',
    updatedNote: null,
  },
]

interface FuentesProps {
  /** From `GET /api/meta`; used for live per-source license and last-update info. Falls back to the static descriptions above while it is still loading or unreachable. */
  meta: MetaResponse | null
}

/** A public, standalone page: `/fuentes` (see the plan and lib/router.ts). Content unchanged from the former SourcesPanel, just laid out for reading (a centered ~68ch column) with a table of contents. */
export function Fuentes({ meta }: FuentesProps) {
  useEffect(() => {
    document.title = 'Fuentes y licencia · ReporteEC'
  }, [])

  const sources = buildSources(meta)

  return (
    <div className="mx-auto w-full max-w-[68ch] px-4 py-6 lg:px-0">
      <header>
        <h1 className="nameplate text-[34px]">Fuentes y licencia</h1>
        <p className="mt-2 text-[14.5px] text-ink-2">De dónde sale cada dato y en qué condiciones se usa.</p>
      </header>

      <nav aria-label="Contenido" className="mt-5 border border-ink bg-sheet px-4 py-3">
        <p className="label text-ink-3">En esta página</p>
        <ol className="mt-2 space-y-1 text-[13.5px]">
          {TOC.map((entry) => (
            <li key={entry.id}>
              <a href={`#${entry.id}`} className="underline hover:no-underline">
                {entry.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-2">
        <Section id="conjuntos-de-datos" title="Conjuntos de datos">
          <ol className="space-y-3">
            {[...sources, ...EXTRA_SOURCES].map((s) => (
              <li key={s.key} className="border-l border-ink pl-3">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-ink underline hover:no-underline">
                    {s.dataset}
                  </a>
                ) : (
                  <span className="font-semibold text-ink">{s.dataset}</span>
                )}
                <span className="block">{s.publisher}</span>
                <span className="block text-ink-3">{s.note}</span>
                {s.license && <span className="block text-ink-3">Licencia: {s.license}</span>}
                {s.updatedNote && <span className="block text-ink-3">{s.updatedNote}</span>}
              </li>
            ))}
          </ol>
        </Section>

        <Section id="tu-ubicacion" title="Tu ubicación">
          <p>
            Si pulsas «Mi ubicación», el navegador te pide permiso y tu posición se muestra solo en tu pantalla. No se
            envía ni se guarda en ningún servidor de ReporteEC.
          </p>
        </Section>

        <Section id="mapa-base" title="Mapa base">
          <p>
            Teselas de{' '}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="underline hover:no-underline">
              OpenFreeMap
            </a>{' '}
            con el esquema de{' '}
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer" className="underline hover:no-underline">
              OpenMapTiles
            </a>
            . Datos cartográficos ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline hover:no-underline"
            >
              colaboradores de OpenStreetMap
            </a>
            , licencia ODbL.
          </p>
        </Section>

        <Section id="condiciones-de-uso" title="Condiciones de uso">
          <p>
            Los datos del Ministerio del Interior se usan según las condiciones de publicación de
            datosabiertos.gob.ec; al revisar el portal no se encontró un texto de licencia explícito para sus
            conjuntos de datos, así que se citan bajo esas condiciones generales, no bajo un nombre de licencia
            concreto. Las cifras de extorsión requieren consultar las condiciones de uso del propio OECO antes de
            reutilizarlas. Los límites de provincias y cantones (geoBoundaries) tienen licencia CC BY 4.0.
          </p>
          <p>Licencia del código de esta plataforma: por definir.</p>
        </Section>

        <Section id="aviso-de-responsabilidad" title="Aviso de responsabilidad">
          <p>
            ReporteEC no afirma que un hecho ocurrió: muestra qué fuente lo publicó y con qué nivel de confianza. La
            información proviene de terceros y puede contener errores u omisiones de origen.
          </p>
          <p>
            Este registro es solo informativo, no un servicio de emergencias. Para una emergencia, llama al 911
            (ECU 911).
          </p>
        </Section>
      </div>
    </div>
  )
}
