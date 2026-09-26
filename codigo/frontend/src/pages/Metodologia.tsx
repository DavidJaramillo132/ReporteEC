import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { ConfidenceChip, Mark } from '../components/Mark'
import { CONFIDENCE, CONFIDENCE_ORDER, INCIDENT_TYPES, TYPE_LABEL } from '../lib/registry'

interface TocEntry {
  id: string
  title: string
}

const TOC: TocEntry[] = [
  { id: 'que-muestra', title: 'Qué muestra el mapa' },
  { id: 'fuentes-actualizacion', title: 'De dónde sale cada dato y cada cuánto se actualiza' },
  { id: 'limites', title: 'Lo que no puede mostrar' },
  { id: 'color-y-marca', title: 'Color y marca' },
  { id: 'conteo-y-tasa', title: 'Conteo y tasa' },
  { id: 'detenciones', title: 'Detenciones: actividad policial' },
  { id: 'por-canton', title: 'Por qué siniestros y extorsión se ven por cantón' },
  { id: 'semaforo-extorsion', title: 'El semáforo de extorsión' },
  { id: 'desaparecidas', title: 'Personas desaparecidas' },
  { id: 'desde-que-anio', title: 'Desde qué año' },
  { id: 'poblacion-pequena', title: 'Cantones con poca población' },
  { id: 'datos-personales', title: 'Datos personales' },
  { id: 'zona-horaria', title: 'Zona horaria' },
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

/** A public, standalone page: `/metodologia` (see the plan and lib/router.ts). Content unchanged from the former MethodologyPanel, just laid out for reading (a centered ~68ch column) with a table of contents. */
export function Metodologia() {
  useEffect(() => {
    document.title = 'Metodología · ReporteEC'
  }, [])

  return (
    <div className="mx-auto w-full max-w-[68ch] px-4 py-6 lg:px-0">
      <header>
        <h1 className="nameplate text-[34px]">Metodología</h1>
        <p className="mt-2 text-[14.5px] text-ink-2">Cómo se construye cada dato de este registro y lo que no puede mostrar.</p>
      </header>

      <nav aria-label="Contenido" className="mt-5 border border-ink bg-sheet px-4 py-3">
        <p className="label text-ink-3">En esta página</p>
        <ol className="mt-2 grid gap-x-4 gap-y-1 text-[13.5px] sm:grid-cols-2">
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
        <Section id="que-muestra" title="Qué muestra el mapa">
          <p>
            Cada marca es un caso publicado por una fuente oficial, con la coordenada que la propia fuente registró.
            ReporteEC no agrega, corrige ni modifica ningún caso.
          </p>
        </Section>

        <Section id="fuentes-actualizacion" title="De dónde sale cada dato y cada cuánto se actualiza">
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

        <Section id="limites" title="Lo que no puede mostrar">
          <p>
            El registro refleja los casos <strong className="font-semibold text-ink">denunciados o registrados</strong>,
            no todo el delito que ocurre. Donde se denuncia menos, el mapa parece más tranquilo de lo que es: esta
            brecha entre lo que ocurre y lo que se denuncia (la «cifra negra») afecta a todos los tipos, pero es
            especialmente relevante en extorsión, donde muchas víctimas no denuncian por miedo a represalias.
          </p>
        </Section>

        <Section id="color-y-marca" title="Color y marca">
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

        <Section id="conteo-y-tasa" title="Conteo y tasa">
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

        <Section id="detenciones" title="Detenciones: actividad policial">
          <p>
            Las detenciones y aprehensiones no son hechos de inseguridad sino acciones de la Policía. Muchas
            detenciones en una zona pueden significar más delito o más presencia policial: las dos lecturas son
            posibles y el dato no distingue entre ellas. Por eso van en una capa aparte, que se activa a mano, y
            nunca se suman a los incidentes.
          </p>
        </Section>

        <Section id="por-canton" title="Por qué siniestros y extorsión se ven por cantón, no como puntos">
          <p>
            El INEC no publica la coordenada de cada siniestro de tránsito, solo la provincia y el cantón donde
            ocurrió. Las denuncias de extorsión, por su parte, señalan negocios y personas concretas: mostrarlas
            como un punto expondría su ubicación exacta. En ambos casos el dato más fino que se puede mostrar sin
            inventar precisión ni comprometer a nadie es el cantón completo, coloreado según su cifra.
          </p>
        </Section>

        <Section id="semaforo-extorsion" title="El semáforo de extorsión">
          <p>
            Cada cantón se clasifica en bajo, moderado, alto o crítico según los cuartiles de la tasa de denuncias
            de extorsión <strong className="font-semibold text-ink">de ese año</strong>, calculados solo entre los
            cantones que tuvieron alguna denuncia. No es una escala fija ni una medida absoluta de peligro: es una
            comparación relativa entre cantones en el mismo año, que puede correrse de un año a otro. Un cantón sin
            ninguna denuncia ese año se marca aparte, como «sin denuncias», no como el nivel más bajo de la escala.
          </p>
        </Section>

        <Section id="desaparecidas" title="Personas desaparecidas">
          <p>
            Solo aparecen en el mapa las personas que siguen sin ser localizadas, en el lugar donde desaparecieron.
            Cuando la fuente registra que una persona fue localizada, su marca se retira del mapa, pero el caso
            sigue contando en las estadísticas: es alguien que sí desapareció, aunque ya no siga desaparecido hoy.
          </p>
        </Section>

        <Section id="desde-que-anio" title="Desde qué año">
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

        <Section id="poblacion-pequena" title="Cantones con poca población">
          <p>
            Cuando la población de un cantón es menor a 10.000 habitantes, un solo caso de más o de menos cambia
            mucho la tasa por 100.000 habitantes. Esas tasas aparecen marcadas con ⚠ en las tablas de estadísticas:
            son reales, pero conviene leerlas junto con el conteo, no solas.
          </p>
        </Section>

        <Section id="datos-personales" title="Datos personales">
          <p>
            Nunca se publica información de las personas involucradas: ni nombre, ni edad, ni etnia, ni
            nacionalidad, ni situación migratoria.
          </p>
        </Section>

        <Section id="zona-horaria" title="Zona horaria">
          <p>Todas las fechas y horas de este registro, incluida la fecha de corte, están en la hora de Ecuador.</p>
        </Section>
      </div>
    </div>
  )
}
