import type { ReactNode } from 'react'
import { ConfidenceChip, Mark } from './Mark'
import type { MetaResponse } from '../lib/api'
import {
  CONFIDENCE,
  CONFIDENCE_ORDER,
  DETENTIONS_SOURCE,
  INCIDENT_TYPES,
  SOURCES,
  TYPE_LABEL,
  formatLongDate,
} from '../lib/registry'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-rule-soft px-4 pt-5 pb-5 last:border-b-0 lg:px-5">
      <h3 className="text-[16px] leading-snug font-semibold">{title}</h3>
      <div className="mt-2 max-w-[68ch] space-y-2 text-[14px] text-ink-2">{children}</div>
    </section>
  )
}

export function MethodologyPanel() {
  return (
    <div>
      <header className="border-b border-ink px-4 py-4 lg:px-5">
        <h2 className="nameplate text-[34px]">Metodología</h2>
        <p className="mt-2 max-w-[60ch] text-[14px] text-ink-2">
          Cómo se construye cada dato de este registro y lo que no puede mostrar.
        </p>
      </header>

      <Section title="Qué muestra el mapa">
        <p>
          Cada marca es un caso publicado por una fuente oficial, con la coordenada que la propia fuente
          registró. ReporteEC no agrega, corrige ni modifica ningún caso.
        </p>
      </Section>

      <Section title="De dónde sale cada dato y cada cuánto se actualiza">
        <p>
          Los homicidios, las personas desaparecidas y las detenciones vienen del Ministerio del Interior, que
          publica cada mes con cerca de un mes de retraso: lo más reciente que verás es el último mes publicado,
          no el mes en curso.
        </p>
        <p>
          La extorsión viene del Observatorio Ecuatoriano de Crimen Organizado (OECO), a partir de denuncias de
          la Fiscalía General del Estado, con publicación anual y datos completos hasta 2025. Los siniestros de
          tránsito vienen del INEC (ESTRA), también de publicación anual, con un adelanto parcial del año en
          curso cuando existe.
        </p>
        <p>
          La población de cada cantón, que solo se usa para calcular tasas, viene de las proyecciones del INEC
          para el mismo año que se consulta.
        </p>
      </Section>

      <Section title="Lo que no puede mostrar">
        <p>
          El registro refleja los casos <strong className="font-semibold text-ink">denunciados o registrados</strong>,
          no todo el delito que ocurre. Donde se denuncia menos, el mapa parece más tranquilo de lo que es: esta
          brecha entre lo que ocurre y lo que se denuncia (la «cifra negra») afecta a todos los tipos, pero es
          especialmente relevante en extorsión, donde muchas víctimas no denuncian por miedo a represalias.
        </p>
      </Section>

      <Section title="Color y marca">
        <p>
          El color y la forma de la marca dicen qué tipo de caso es. El trazo dice cuánto respaldo tiene: una
          marca rellena es oficial; las rayadas o con borde discontinuo tienen menos confirmación. En esta
          primera edición todo el registro es oficial, así que el trazo se ve igual en todo el mapa; queda listo
          para cuando se sumen otras fuentes.
        </p>
        <ul className="mt-2 space-y-1.5">
          {INCIDENT_TYPES.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Mark type={t} size={20} />
              {TYPE_LABEL[t].one}
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1.5">
          {CONFIDENCE_ORDER.map((c) => (
            <li key={c} className="grid grid-cols-[7.5rem_1fr] gap-3">
              <ConfidenceChip confidence={c} />
              <span>
                {CONFIDENCE[c].meaning} <span className="text-ink-3">({CONFIDENCE[c].style.toLowerCase()})</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          El trazo no cambia con el año: un caso oficial de hace años sigue siendo oficial. Si es antiguo o
          reciente se indica aparte, como su vigencia.
        </p>
      </Section>

      <Section title="Conteo y tasa">
        <p>
          El <strong className="font-semibold text-ink">conteo</strong> dice cuántos casos hubo: sirve para ver
          dónde se concentran. La <strong className="font-semibold text-ink">tasa por 100.000 habitantes</strong>{' '}
          dice qué tan probable es que le ocurra a una persona de ese lugar: sirve para comparar lugares de
          distinto tamaño.
        </p>
        <p>
          Por ejemplo, con datos de homicidios de 2024: Guayaquil registró 1.954 casos frente a 11 en Las Naves,
          un cantón mucho más pequeño — el conteo por sí solo sugiere que Guayaquil es incomparablemente peor.
          Pero la tasa cuenta otra historia: 66,1 casos por 100.000 habitantes en Guayaquil frente a 150,7 en Las
          Naves. El cantón pequeño tiene, en proporción, más del doble de riesgo para quien vive ahí. Por eso las
          dos cifras se muestran siempre juntas, nunca una sola.
        </p>
      </Section>

      <Section title="Detenciones: actividad policial">
        <p>
          Las detenciones y aprehensiones no son hechos de inseguridad sino acciones de la Policía. Muchas
          detenciones en una zona pueden significar más delito o más presencia policial: las dos lecturas son
          posibles y el dato no distingue entre ellas. Por eso van en una capa aparte, que se activa a mano, y
          nunca se suman a los incidentes.
        </p>
      </Section>

      <Section title="Por qué siniestros y extorsión se ven por cantón, no como puntos">
        <p>
          El INEC no publica la coordenada de cada siniestro de tránsito, solo la provincia y el cantón donde
          ocurrió. Las denuncias de extorsión, por su parte, señalan negocios y personas concretas: mostrarlas
          como un punto expondría su ubicación exacta. En ambos casos el dato más fino que se puede mostrar sin
          inventar precisión ni comprometer a nadie es el cantón completo, coloreado según su cifra.
        </p>
      </Section>

      <Section title="El semáforo de extorsión">
        <p>
          Cada cantón se clasifica en bajo, moderado, alto o crítico según los cuartiles de la tasa de denuncias
          de extorsión <strong className="font-semibold text-ink">de ese año</strong>, calculados solo entre los
          cantones que tuvieron alguna denuncia. No es una escala fija ni una medida absoluta de peligro: es una
          comparación relativa entre cantones en el mismo año, que puede correrse de un año a otro. Un cantón sin
          ninguna denuncia ese año se marca aparte, como «sin denuncias», no como el nivel más bajo de la escala.
        </p>
      </Section>

      <Section title="Personas desaparecidas">
        <p>
          Solo aparecen en el mapa las personas que siguen sin ser localizadas, en el lugar donde desaparecieron.
          Cuando la fuente registra que una persona fue localizada, su marca se retira del mapa, pero el caso
          sigue contando en las estadísticas: es alguien que sí desapareció, aunque ya no siga desaparecido hoy.
        </p>
      </Section>

      <Section title="Desde qué año">
        <p>
          El registro empieza en 2019, el primer año en que todos los conjuntos oficiales tienen datos. Esta
          edición de prueba contiene solo enero a agosto de 2026; los años anteriores se cargarán con la ingesta
          completa.
        </p>
        <p>
          2019 tiene una excepción propia: de los 1.189 homicidios de ese año, 810 (68 %) no traen una coordenada
          exacta, solo el cantón donde ocurrieron. Esos 810 casos se cuentan igual en las estadísticas de 2019,
          pero no se dibujan como puntos en el mapa — dibujarlos en el centro del cantón sugeriría una precisión
          que la fuente nunca publicó. Desde 2020 todos los homicidios traen coordenada propia.
        </p>
      </Section>

      <Section title="Cantones con poca población">
        <p>
          Cuando la población de un cantón es menor a 10.000 habitantes, un solo caso de más o de menos cambia
          mucho la tasa por 100.000 habitantes. Esas tasas aparecen marcadas con ⚠ en las tablas de estadísticas:
          son reales, pero conviene leerlas junto con el conteo, no solas.
        </p>
      </Section>

      <Section title="Datos personales">
        <p>
          Nunca se publica información de las personas involucradas: ni nombre, ni edad, ni etnia, ni
          nacionalidad, ni situación migratoria.
        </p>
      </Section>

      <Section title="Zona horaria">
        <p>Todas las fechas y horas de este registro, incluida la fecha de corte, están en la hora de Ecuador.</p>
      </Section>
    </div>
  )
}

interface SourcesPanelProps {
  /** From `GET /api/meta`; used for live per-source license and last-update
   * info. Falls back to the static descriptions below while it is still
   * loading or unreachable. */
  meta: MetaResponse | null
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

/** Matches the exact wording `GET /api/meta` returns for each slug, so the page never disagrees with the live value once it loads. */
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

export function SourcesPanel({ meta }: SourcesPanelProps) {
  const sources = buildSources(meta)
  return (
    <div>
      <header className="border-b border-ink px-4 py-4 lg:px-5">
        <h2 className="nameplate text-[34px]">Fuentes y licencia</h2>
        <p className="mt-2 max-w-[60ch] text-[14px] text-ink-2">De dónde sale cada dato y en qué condiciones se usa.</p>
      </header>

      <Section title="Conjuntos de datos">
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

      <Section title="Tu ubicación">
        <p>
          Si pulsas «Mi ubicación», el navegador te pide permiso y tu posición se muestra solo en tu pantalla. No se
          envía ni se guarda en ningún servidor de ReporteEC.
        </p>
      </Section>

      <Section title="Mapa base">
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

      <Section title="Condiciones de uso">
        <p>
          Los datos del Ministerio del Interior se usan según las condiciones de publicación de
          datosabiertos.gob.ec; al revisar el portal no se encontró un texto de licencia explícito para sus
          conjuntos de datos, así que se citan bajo esas condiciones generales, no bajo un nombre de licencia
          concreto. Las cifras de extorsión requieren consultar las condiciones de uso del propio OECO antes de
          reutilizarlas. Los límites de provincias y cantones (geoBoundaries) tienen licencia CC BY 4.0.
        </p>
        <p>Licencia del código de esta plataforma: por definir.</p>
      </Section>

      <Section title="Aviso de responsabilidad">
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
  )
}
