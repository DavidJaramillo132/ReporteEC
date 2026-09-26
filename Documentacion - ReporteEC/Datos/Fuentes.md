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

### Dataset descargado: OECO «Noticias del Delito» (verificado 2026-09-25)

Descarga en CSV, previo formulario de registro, desde
https://visualizador-oeco.up.railway.app/descargas (visualizador embebido en
`oeco.padf.org/datos`). Fuente original: FGE, *Estadística de Noticias de
Delito relacionados a Crimen Organizado*. Guardado en
`codigo/data/raw/oeco/noticias_delito_2019_2025.csv` (no se versiona).

- **Columnas:** `d_ANIO_PS`, `d_mes` (nombre en español), `d_PROVINCIA_INCIDENTE`,
  `d_CANTON_INCIDENTE` (nombres, sin código DPA), `d_DELITO`, `d_TIPO_DELITO`
  (Consumado / Tentativa), `d_total`.
- **Nivel:** conteo **mensual por cantón y delito**. Sin coordenadas: encaja con
  el semáforo cantonal. 171.689 filas, 2019–2025.
- **Delitos útiles:** `Extorsión` y `Secuestro Extorsivo`, entre ~35 delitos de
  crimen organizado.
- **Extorsión (consumada + tentativa):** 2019: 1.616 · 2020: 2.080 · 2021: 2.801 ·
  2022: 8.399 · 2023: 21.809 · 2024: 23.082 · 2025: 16.130. Confirma las cifras de
  [[Extorsión y Vacunas a Negocios]]. 215 cantones con al menos una denuncia.
- **Cuidado:** los cantones vienen por nombre; hay que cruzarlos con la tabla
  DPA para obtener el código. Revisar licencia y condiciones de uso del OECO
  antes de publicar.

También existe el tablero de la FGE
[Analítica de noticias del delito](https://www.fiscalia.gob.ec/analitica-noticias-del-delito/)
(todos los delitos del COIP, 2015 – agosto 2026, por cantón y franja horaria),
pero **sin descarga**; sirve solo como referencia para contrastar.

## Límites territoriales — geoBoundaries.org (no CONALI/INEC)

> [!warning] Corrección (2026-09-26)
> Se había registrado aquí que `codigo/data/raw/dpa/cantones_ecuador_simplificado.geojson`
> y `provincias_ecuador_simplificado.geojson` venían de **CONALI/INEC** (*Marco
> Geoestadístico y Cartografía Censal 2022*). Al inspeccionar los archivos para
> la carga de la Fase 5, sus propiedades resultaron ser
> `shapeName`/`shapeISO`/`shapeID`/`shapeGroup`/`shapeType` con
> `shapeType: "ADM1"`/`"ADM2"` — la firma exacta de una exportación de
> **[geoBoundaries.org](https://www.geoboundaries.org)**, no de CONALI/INEC.
> Ninguno de los dos archivos trae código DPA alguno.

- **Origen real:** geoBoundaries.org, extracto ADM1 (24 provincias) y ADM2
  (224 cantones) para Ecuador (`shapeGroup: "ECU"`).
- **Sin código DPA:** cada cantón se identifica solo por `shapeName` (nombre),
  no por código. La carga (`cantons --file`, ver
  `app/modules/ingestion/territory.py`) resuelve el código DPA cruzando el
  nombre contra `admin_units` (poblada por los propios archivos oficiales del
  Ministerio del Interior), y para los nombres duplicados a nivel nacional —
  "Bolívar" (Carchi y Manabí) y "Olmedo" (Loja y Manabí) — desambigua por
  contención espacial contra las provincias, ya que el archivo de cantones no
  trae ninguna referencia a su provincia.
- **216 de 224 formas coinciden** con un cantón de `admin_units` (los otros 5
  necesitan un alias por abreviatura/nombre alterno: "Crnel. Marcelino
  Maridueña", "Gnral. Antonio Elizalde", "Empalme", "Alfredo Baquerizo Moreno"
  y "Orellana"). **Tres formas no tienen equivalente:** "El Piedrero", "Las
  Golondrinas" y "Manga del Cura" — ninguna aparece todavía en los archivos
  oficiales de incidentes/detenciones (cantones nuevos o zonas no
  delimitadas); la carga los reporta como no coincidentes en vez de
  descartarlos en silencio.
- **Aún pendiente:** confirmar si CONALI/INEC publican un Shapefile/GeoJSON
  propio, con código DPA incluido, que reemplace este archivo con una fuente
  verificada de primera mano.

## Población por cantón — INEC (verificado 2026-09-26)

- **Archivo:** `codigo/data/raw/poblacion/Total_cantonal_2010-2035.xlsx`
  (más `Cantonal.zip`, el mismo contenido comprimido).
- **Fuente:** INEC, *Proyección de la Población Ecuatoriana por años
  calendario, según cantones, 2010-2035* (Cuadro N° 1.1 "Provincia y cantón").
  Un libro por provincia (24 hojas + "Índice"), con una fila por cantón y una
  columna por año (2010 a 2035, "Estimación" hasta 2022 y "Proyección" desde
  2023).
- **Carga:** `population --file <xlsx>` (`app/modules/ingestion/territory.py`),
  cruzando cada nombre de cantón/provincia contra `admin_units` -- igual
  criterio que la carga de cantones. Único ajuste necesario: la hoja de
  Pichincha nombra a la capital "Distrito Metropolitano de Quito"
  (`admin_units` la tiene como "Quito").
- **Cobertura confirmada en el ambiente de desarrollo:** 221 cantones × 26
  años (2010-2035) = 5.746 filas cargadas, sin cantón ni provincia sin
  emparejar. Usada para la tasa por 100.000 habitantes de `GET /api/stats`
  (ver [[Decisiones de Negocio Pendientes]], punto 5, ya resuelto).

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

- Estadísticas de denuncias de la Fiscalía General del Estado (candidata
  principal, ver abajo)
- Solicitud formal de acceso a la información pública (LOTAIP)
- Reportes ciudadanos y noticias ([[Niveles de Confianza]] 🟡 / 🟠)

### Candidata: Fiscalía — Analítica de cifras de robo (revisado 2026-09-25)

https://www.fiscalia.gob.ec/analitica-cifras-de-robo/

Tablero **Power BI publicado en la web** (6 páginas, fecha de corte 11 de
septiembre de 2026). Se leyó la estructura del modelo de datos que descarga el
visor, no las filas.

**Origen según el propio informe:**

- Son **noticias del delito** (denuncias) de robo registradas por la FGE,
  delitos «de mayor connotación psicosocial» (manual de indicadores 2015).
- **2019–2022:** cifras del Grupo de Fortalecimiento Estadístico de la
  Comisión Especial de Estadística de Seguridad, Justicia, Crimen y
  Transparencia.
- **Desde 2023:** el tipo de robo lo asigna un **modelo de aprendizaje
  automático** (procesamiento de lenguaje natural) de la FGE. El informe
  advierte: *«Datos sujetos a variación»*.

**Tablas del modelo:**

| Tabla | Período | Campos útiles | Ubicación |
|---|---|---|---|
| `df` | 2019–2022 | número de denuncia, fecha y hora, modalidad, presunto delito, desagregación | ciudad, parroquia, códigos de cantón, parroquia y **barrio** |
| `df2` | 2023 en adelante | número de denuncia, fecha y hora, tipo de robo, modalidad | parroquia, cantón, provincia, **latitud y longitud** |

Tablas auxiliares: `CODUBI` (códigos de cantón) y `DescRobos`.

> [!warning] Limitaciones
> - **Sin descarga.** No hay archivo ni botón de exportar; la API de Power BI
>   responde 403 fuera de su visor. Extraer filas sería scrapear una API
>   interna no documentada: mismo criterio que con el visor de la ANT, **no se
>   hace**.
> - **Clasificación automática desde 2023:** el tipo de robo es una estimación
>   del modelo, no un dato oficial puro. Debe indicarse en la ficha del
>   registro y en [[Calidad de Datos]].
> - **Datos personales en `df`:** género, sexo, edad, estatus migratorio y
>   autoidentificación étnica. **Nunca se cargan** ([[Esquema de Campos]]).
> - Son **denuncias**, no hechos confirmados: el subregistro aplica igual que
>   en el resto de fuentes.

**Siguiente paso (pospuesto):** solicitud formal a la FGE o por LOTAIP
pidiendo exactamente: denuncias de robo desde 2019 con número anonimizado,
fecha, hora, provincia, cantón, parroquia, tipo de robo, modalidad, latitud y
longitud, **sin datos personales**, en CSV o XLSX. Nombrar la tabla y los
campos hace la solicitud concreta y fácil de atender.

## No estructurada

**Noticias de la Policía Nacional** — https://noticias.policia.gob.ec/
(apartado «Últimas»)

Se accede por la API REST de WordPress, sin scrapear HTML. Publica resultados
policiales (~7 noticias por día), no incidentes en vivo, y ubica solo a nivel
de provincia o cantón. Detalle en [[Scraper Noticias Policía]].

## Cómo acceder a los archivos

Las URLs de descarga contienen un UUID que **cambia en cada publicación**.
Resolverlas dinámicamente: ver [[CKAN — Acceso a Datos]].
