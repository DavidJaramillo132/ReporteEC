---
tags: [datos, fuentes]
actualizado: 2026-09-24
---

# Fuentes

> [!tip] Criterio permanente
> Usar siempre los datos más actualizados disponibles.

## Oficiales — Ministerio del Interior

Publicados en el portal de datos abiertos del Estado. Los tres comparten
características: formato **XLSX** (no CSV, no API de consulta), frecuencia de
actualización **mensual**, y una fila por caso individual con coordenadas
propias ([[Esquema de Campos]]).

| Dataset | Slug | Cobertura histórica | Última publicación |
|---|---|---|---|
| Homicidios Intencionales | `homicidios-intencionales` | 2014–2025 + 2026 | 2026-09-18 |
| Personas Desaparecidas | `personas-desaparecidas` | 2017–2025 + 2026 | 2026-09-17 |
| Personas Detenidas y Aprehendidas | `personas-detenidas-aprehendidas` | 2019–2025 + 2026 | — |

URLs de los datasets:

- https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales
- https://www.datosabiertos.gob.ec/dataset/personas-desaparecidas
- https://www.datosabiertos.gob.ec/dataset/personas-detenidas-aprehendidas

> [!warning] Rezago real
> El archivo publicado el 18 de septiembre de 2026 cubre hasta **agosto**.
> Aproximadamente un mes de retraso. Estas fuentes **no sirven** para la capa
> de tiempo casi real ([[Riesgos Abiertos]]).

Cada dataset incluye además un **diccionario de variables** (`_dd_`) que
documenta campo por campo. Es la referencia autoritativa del esquema.

### Otros datasets del Ministerio del Interior

El Ministerio publica exactamente seis datasets en el portal (verificado
2026-09-22). Además de los tres anteriores:

- `armas-ilicitas`
- `sustancias-sujetas-a-fiscalizacion-depositadas`
- `trata-de-personas-y-trafico-ilicito-de-migrantes`

No evaluados todavía.

## Oficiales — Fiscalía General del Estado (FGE) y OECO

Fuente primordial para **Extorsión («Vacunas»)** y delitos a la propiedad.

- **FGE:** Publica estadísticas del sistema de justicia penal sobre noticias del delito (denuncias) tipificadas según el Art. 185 del COIP. Frecuencia mensual y anual por provincia y cantón.
- **OECO (Observatorio Ecuatoriano de Crimen Organizado / PADF):** Sistematiza y normaliza las cifras de FGE y Policía Nacional, ofreciendo indicadores sobre extorsión, usura y mercados ilícitos.
- Detalle y metodología en [[Extorsión y Vacunas a Negocios]].

## Límites territoriales (DPA) — CONALI / INEC

Identificada la fuente oficial para las geometrías de provincias, cantones y parroquias:
- **CONALI** (Comité Nacional de Límites Internos) e **INEC** mediante el *Marco Geoestadístico y Cartografía Censal 2022*.
- Proveen las geometrías oficiales en Shapefile / GeoJSON (WGS84) para dibujar polígonos cantonales, calcular coropletos de siniestros, estimar el riesgo comercial y cruzar buffers viales.

## Población por cantón — INEC (pendiente)

Necesaria para calcular tasas por 100.000 habitantes en las estadísticas
(ver [[Decisiones de Negocio Pendientes]], punto 5). Fuente prevista: Censo de
Población y Vivienda 2022 y proyecciones del INEC. **No verificada todavía.**

## Siniestros de tránsito — INEC (ESTRA)

**Estadísticas de Transporte, siniestros de tránsito trimestral.**
https://www.ecuadorencifras.gob.ec/siniestros-transito-trimestral/

Registros administrativos de la Agencia Nacional de Tránsito procesados por
INEC. Se publican fuera de CKAN, en el sitio de INEC, como CSV dentro de ZIP.

> [!warning] Sin coordenadas
> Verificado sobre el archivo de enero–marzo 2026 (4.789 siniestros): la
> ubicación llega **solo como código de provincia y cantón**. No hay
> latitud ni longitud. Los choques oficiales **no pueden representarse como
> puntos**, solo agregados por cantón.

Características: separador `;`, códigos de provincia y cantón numéricos (hace
falta una tabla de correspondencia DPA), una fila por siniestro, variables de
fallecidos, lesionados, clase, causa, tipo de vehículo y hasta 23
participantes. Frecuencia **trimestral**; el primer trimestre de 2026 se
publicó el 11 de mayo (~6 semanas de rezago).

### Búsqueda de coordenadas para choques (2026-09-22)

Se buscó activamente una fuente con ubicación punto de cada siniestro.
**Resultado: no existe ninguna fuente pública descargable con coordenadas.**

| Fuente | Resultado |
|---|---|
| INEC ESTRA 2026 (datos abiertos + diccionario) | Solo `PROVINCIA` y `CANTON`. Confirmado en el diccionario oficial |
| ANT — [visor Power BI](https://www.ant.gob.ec/estadisticas/) | Filtra hasta parroquia y red vial estatal, pero **sin descarga**. Extraer datos implicaría scrapear una API interna no documentada de Power BI: frágil y fuera de cualquier canal de datos abiertos |
| `siniestros.ant.gob.ec` | Portal de trámites (licencias, pagos). Sin datos |
| Estudio geoespacial UISEK (Región Costa) | Usó agregados por provincia de la ANT. No prueba que existan coordenadas |
| Quito Data Vial (AMT + Bloomberg Philanthropies) | Visor con mapas solo para Quito; sin URL pública ni descarga confirmada |
| Observatorio de Movilidad ATM Guayaquil | Estadísticas mensuales y anuarios solo para Guayaquil; dominio `observatorioatm.com` no resolvía al consultarlo |

**Vías que quedan abiertas — pospuestas por decisión del 2026-09-22:**

1. **Solicitud formal a la ANT** («Solicitud Estadísticas de Siniestros de
   Tránsito») o a la Comisión de Tránsito del Ecuador (trámite «Provisión de
   estadísticas de siniestros de tránsito» en gob.ec), pidiendo
   **explícitamente latitud y longitud**. Los partes policiales registran el
   lugar del siniestro y el visor de la ANT filtra por red vial, lo que sugiere
   que la ANT tiene el dato georreferenciado. No está verificado.
2. **Solicitud por LOTAIP** si la anterior no prospera.
3. **Municipios** (Quito, Guayaquil) para cobertura urbana parcial.
4. **Tiempo real:** noticias y reportes ciudadanos, con confianza máxima 🟡 / 🟠.

Mientras tanto, los choques oficiales solo pueden representarse **por
cantón**.

### Descartados

- **SPPAT** (`fallecidos-por-accidentes-de-transito-registradas-por-el-sppat`):
  cubre 2016–2021, sin actualizar desde noviembre de 2021, y solo incluye
  víctimas cuyos beneficiarios cobraron el seguro. Sesgo de selección.
- **INEC anuario 2019** en el portal CKAN: obsoleto.

## Violencia sexual — sin fuente utilizable para el mapa

Búsqueda en `datosabiertos.gob.ec` el 2026-09-24 («violencia sexual»,
«violación», «delitos sexuales», «abuso sexual»: 0 resultados). Solo
aparecen dos datasets relacionados:

| Dataset | Qué es | Por qué no sirve para el mapa |
|---|---|---|
| **Matriz Integral de Registros de Atención** (Secretaría de Derechos Humanos) | Atenciones a víctimas en los Servicios de Protección Integral. Enero–junio 2021: 34.711 atenciones, de ellas **3.661 por violencia sexual** | Son **atenciones, no denuncias ni hechos**. La ubicación es la **provincia y cantón donde vive la víctima**, no donde ocurrió, y sin coordenadas. Solo cubre **junio 2020 – 2021** y no se actualiza desde 2022 |
| **Encuesta de relaciones familiares y violencia de género contra las mujeres 2019** (INEC) | Encuesta: mide qué porcentaje de mujeres sufrió violencia a lo largo de su vida | Es una **encuesta**, no un registro de casos. Sirve para contexto, no para ubicar hechos |

**Conclusión:** violencia sexual sigue **sin fuente oficial para el mapa**
([[Tipos de Incidente]]). El 89 % de las atenciones de la Secretaría son en el
ámbito intrafamiliar, así que incluso agregadas por cantón de residencia
señalarían dónde viven las víctimas; no se recomienda publicarlas.

> [!info] Decidido el 2026-09-24
> **No se buscan más fuentes para este tipo.** El proyecto sigue solo con las
> fuentes ya incorporadas (Ministerio del Interior e INEC).

## Robos — sin fuente abierta

> [!danger] Por definir
> **No existe ningún dataset de robos en el portal de datos abiertos.** El
> Ministerio del Interior publica cifras de robos en prensa (por tipo: a
> personas, domicilios, unidades económicas, carreteras), pero no como datos
> descargables. Búsqueda en CKAN por «robos»: 0 resultados.

Vías posibles, **pospuestas** (se retomarán más adelante):

- Estadísticas de denuncias de la Fiscalía General del Estado
- Solicitud formal de acceso a la información pública (LOTAIP)
- Reportes ciudadanos y noticias ([[Niveles de Confianza]] 🟡 / 🟠)

## No estructurada

**Noticias de la Policía Nacional** — https://noticias.policia.gob.ec/
(apartado «Últimas»)

Se accede por la API REST de WordPress, sin scrapear HTML. Publica resultados
policiales (~7 noticias por día), no incidentes en vivo, y ubica solo a nivel
de provincia o cantón. Detalle en [[Scraper Noticias Policía]].

## Cómo acceder a los archivos

Las URLs de descarga contienen un UUID que **cambia en cada publicación**.
Resolverlas dinámicamente: ver [[CKAN — Acceso a Datos]].
