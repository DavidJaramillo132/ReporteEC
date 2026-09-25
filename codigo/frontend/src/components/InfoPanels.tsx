import type { ReactNode } from 'react'
import { ConfidenceChip, Mark } from './Mark'
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
          Cada marca es un caso publicado por el Ministerio del Interior en el portal de datos abiertos del Estado,
          con la coordenada que la propia fuente registró. ReporteEC no agrega ni modifica casos.
        </p>
      </Section>

      <Section title="Lo que no puede mostrar">
        <p>
          El registro refleja los casos denunciados o registrados, no todo el delito que ocurre. Donde se denuncia
          menos, el mapa parece más tranquilo de lo que es.
        </p>
        <p>
          La fuente publica cada mes, con cerca de un mes de retraso: lo más reciente que verás es el último mes
          publicado.
        </p>
      </Section>

      <Section title="Color y marca">
        <p>
          El color y la forma de la marca dicen qué tipo de caso es. El trazo dice cuánto respaldo tiene: una marca
          rellena es oficial; las rayadas o con borde discontinuo tienen menos confirmación.
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
          El trazo no cambia con el año: un caso oficial de hace años sigue siendo oficial. Si es antiguo o reciente
          se indica aparte, como su vigencia.
        </p>
      </Section>

      <Section title="Conteo y tasa">
        <p>
          El <strong className="font-semibold text-ink">conteo</strong> dice cuántos casos hubo: sirve para ver
          dónde se concentran. La <strong className="font-semibold text-ink">tasa por 100.000 habitantes</strong>{' '}
          dice qué tan probable es que le ocurra a una persona de ese lugar: sirve para comparar lugares de distinto
          tamaño.
        </p>
        <p>
          Por ejemplo, 1.000 casos en una ciudad de 2.500.000 personas son una tasa de 40, y 20 casos en un cantón
          de 25.000 son una tasa de 80: el cantón pequeño es el doble de riesgoso para quien vive ahí. Por eso las
          dos cifras se muestran juntas.
        </p>
      </Section>

      <Section title="Detenciones: actividad policial">
        <p>
          Las detenciones y aprehensiones no son hechos de inseguridad sino acciones de la Policía. Muchas
          detenciones en una zona pueden significar más delito o más presencia policial. Por eso van en una capa
          aparte, que se activa a mano, y nunca se suman a los incidentes.
        </p>
      </Section>

      <Section title="Personas desaparecidas">
        <p>
          Solo aparecen las personas que siguen sin ser localizadas, en el lugar donde desaparecieron. Cuando la
          fuente registra que una persona fue localizada, su marca se retira del mapa.
        </p>
      </Section>

      <Section title="Desde qué año">
        <p>
          El registro empieza en 2019, el primer año en que todos los conjuntos oficiales tienen datos. Esta edición
          de prueba contiene solo enero a agosto de 2026; los años anteriores se cargarán con la ingesta completa.
        </p>
      </Section>

      <Section title="Datos personales">
        <p>
          Nunca se publica información de las personas involucradas: ni nombre, ni edad, ni etnia, ni nacionalidad,
          ni situación migratoria.
        </p>
      </Section>
    </div>
  )
}

export function SourcesPanel() {
  const sources = [
    ...Object.values(SOURCES).map((s) => ({ ...s, note: `Actualizado el ${formatLongDate(s.updated)}` })),
    { ...DETENTIONS_SOURCE, note: 'Capa de actividad policial, agregada en celdas de unos 100 metros' },
  ]
  return (
    <div>
      <header className="border-b border-ink px-4 py-4 lg:px-5">
        <h2 className="nameplate text-[34px]">Fuentes y licencia</h2>
        <p className="mt-2 max-w-[60ch] text-[14px] text-ink-2">De dónde sale cada dato y en qué condiciones se usa.</p>
      </header>

      <Section title="Conjuntos de datos">
        <ol className="space-y-3">
          {sources.map((s) => (
            <li key={s.url} className="border-l border-ink pl-3">
              <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-ink underline hover:no-underline">
                {s.dataset}
              </a>
              <span className="block">{s.name} · datosabiertos.gob.ec</span>
              <span className="block text-ink-3">{s.note}</span>
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
          Teselas de OpenFreeMap con el esquema de OpenMapTiles. Datos cartográficos © colaboradores de
          OpenStreetMap.
        </p>
      </Section>

      <Section title="Condiciones de uso">
        <p>
          Los datos provienen del portal de datos abiertos del Ecuador y se usan según sus condiciones de
          publicación, que están en revisión para citarlas aquí con exactitud. La licencia de la propia plataforma
          está por definir.
        </p>
      </Section>

      <Section title="Aviso de responsabilidad">
        <p>
          ReporteEC no afirma que un hecho ocurrió: muestra qué fuente lo publicó y con qué nivel de confianza. La
          información proviene de terceros y puede contener errores u omisiones de origen.
        </p>
      </Section>
    </div>
  )
}
