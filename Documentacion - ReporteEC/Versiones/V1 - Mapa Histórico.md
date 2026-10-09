---
tags: [version, v1, mapa-historico]
actualizado: 2026-10-09
estado: publicada, en cierre
---
# V1 — Mapa Histórico

> [!abstract] Objetivo
> Un mapa público, rápido y confiable con **todos los datos oficiales desde
> 2019**, que explique con claridad de dónde sale cada dato. Funciona solo,
> sin cuentas ni tiempo real, pero construido para que la [[V2 - Rutas e Inteligencia Horaria]]
> y las siguientes versiones se sumen sin rehacer nada.

Visión general de las versiones en [[Hoja de Ruta]].

> [!success] Estado actual (2026-10-03)
> La V1 está **publicada** en https://reporteec.playhubb.site (HTTPS), con
> los datos oficiales cargados y verificados contra los archivos de origen.
> La licencia del código ya está decidida: GNU AGPL v3 (`LICENSE`).
> Para darla por cerrada falta:
>
> 1. **Worker diario:** `datosabiertos.gob.ec` responde 403 a la IP del VPS,
>    así que el worker no corre en producción. Por ahora los datos se
>    actualizan a mano con `codigo/scripts/actualizar_datos.sh`.
> 2. **Pruebas manuales:** solo falta instalar la PWA en Android y en iPhone.

---

## Fase 0 — Cimientos

Antes de construir funciones, probar que el stack funciona de punta a punta.

1. Crear la estructura de `codigo/`: `backend/`, `frontend/`, `despliegue/`
   ([[Módulos del Sistema]])
2. Crear los proyectos: frontend con **Bun** y backend con **uv**
   ([[Stack e Infraestructura]], «Entorno de desarrollo»)
3. Levantar Docker Compose con PostgreSQL + PostGIS
4. **Esqueleto:** homicidios de 2026 → PostGIS → Martin → puntos en el mapa del
   navegador
5. Verificar fuentes pendientes: población por cantón del INEC y año de inicio
   de los siniestros del INEC *(resuelto: ambas están cargadas; los siniestros
   empiezan en 2019)*

**Se termina cuando** aparecen puntos reales en un mapa en el navegador. Si
ese camino funciona, el [[Stack e Infraestructura]] queda probado.

---

## Qué trae la V1

### Datos

| Fuente                                       | Cómo se muestra                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Homicidios intencionales                     | Puntos + mapa de calor                                                      |
| Personas desaparecidas                       | Puntos + mapa de calor; las**localizadas se quitan del mapa**         |
| Detenidos y aprehendidos                     | **Capa aparte**, solo mapa de calor, rotulada como actividad policial |
| Extorsión y vacunas a negocios (FGE / OECO) | **Por cantón**, semáforo de riesgo comercial ([[Extorsión y Vacunas a Negocios]])                     |
| Siniestros de tránsito (INEC)               | **Por cantón** (no hay coordenadas)                                  |
| Población por cantón (INEC)                | No se muestra; sirve para calcular tasas                                    |
| Robos                                        | **Fuera de la V1**. Fuente candidata: tablero de robos de la Fiscalía, pendiente de solicitud formal ([[Fuentes]]) |

Todo desde **2019**, el primer año en que todos los datasets tienen datos.
Tipos de incidente según [[Tipos de Incidente]].

### Páginas

| Página                      | Qué contiene                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Inicio**             | El mapa es la portada (decidido 2026-09-26). La primera visita muestra un aviso breve: qué es ReporteEC, qué muestra y qué no, cómo leer el mapa (color y forma = tipo, trazo = confianza) |
| **Mapa**               | La vista principal: capas, filtros y detalle de cada incidente                                                                      |
| **Estadísticas**      | Gráficos por tipo, provincia, cantón y mes, con conteo y tasa                                                                     |
| **Metodología**       | Cómo se construye cada dato (ver abajo)                                                                                            |
| **Licencia y fuentes** | Atribución de cada fuente, licencia de los datos abiertos, licencia de la plataforma y aviso de responsabilidad                    |

### Mapa

- **Puntos al acercar, mapa de calor al alejar**
- **Color y forma de la marca = tipo**; **estilo de trazo = nivel de confianza**
  ([[Niveles de Confianza]], decidido 2026-09-25)
- **Detalle al tocar un punto:** tipo, fecha, lugar, fuente, nivel de confianza
  y enlace a la fuente original
- **Filtros:** año (uno o varios, 2019 → hoy), mes, provincia, cantón y tipo,
  en una sola fila con las listas «Tipos» y «Capas». «Capas» reúne la capa por
  cantón (ninguna, extorsión o siniestros de tránsito) y el mapa de calor de
  detenciones. Los filtros se guardan en la dirección de la página
- **Los homicidios sin coordenadas** (811) se guardan en un punto dentro de su
  cantón (`location_precision = 'canton'`): cuentan en las estadísticas, pero
  no se dibujan en el mapa
- **Nota metodológica visible:** el mapa muestra denuncias, no todo el delito
  que ocurre

### Estadísticas

- Gráficos hechos a mano (SVG, sin librería), cada uno con un botón
  «Ver tabla» que muestra las mismas cifras
- Aceptan cualquier conjunto de años. Con varios años, la tasa es un
  **promedio por año**: casos entre la población sumada de esos años, por
  100.000 habitantes
- Por tipo, provincia, cantón y mes
- **Conteo** (cuántos casos) y **tasa por 100.000 habitantes** (qué tan
  probable es por persona), siempre juntos
- Aviso en cantones con muy poca población, donde la tasa varía mucho con
  pocos casos

### Página de metodología

Es obligatoria en la V1 porque es donde se explica de dónde sale la
información. Debe explicar:

- **De dónde sale cada dato:** fuente, frecuencia de actualización y rezago
  (el Ministerio publica cada mes con ~1 mes de retraso)
- **Qué significa cada nivel de confianza** y por qué el color no cambia con el
  año
- **Conteo frente a tasa:** qué es el total de casos, qué es la tasa por
  100.000 habitantes y cuándo usar cada uno, con un ejemplo
- **Denuncias frente a delitos:** el mapa refleja lo que se denuncia; donde se
  denuncia menos, parece que pasa menos
- **Por qué los detenidos van aparte:** son actividad policial, no inseguridad
- **Por qué los siniestros van por cantón:** la fuente no publica coordenadas
- **Por qué el mapa empieza en 2019**
- **Qué pasa con las personas desaparecidas localizadas**
- **Qué datos personales no se muestran nunca** (etnia, nacionalidad,
  estatus migratorio)

### Página de licencia y fuentes

- Atribución de cada fuente: Ministerio del Interior, INEC
- **Licencia de los datos abiertos** del portal `datosabiertos.gob.ec`:
  revisado, no tiene un texto de licencia explícito, así que se citan bajo las
  condiciones generales del portal
- Límites de provincias y cantones: geoBoundaries (CC BY 4.0). Mapa base:
  OpenStreetMap (ODbL)
- Licencia de la propia plataforma y de su código: **GNU AGPL v3** (`LICENSE`, decidido 2026-10-09). Cubre solo el código; los datos conservan la licencia de cada fuente
- **Aviso de responsabilidad:** la información proviene de terceros y se
  muestra con su nivel de confianza; ReporteEC no afirma que los hechos
  ocurrieron

### Ingesta y datos

- **Modelo de datos definitivo desde el inicio**, con los campos que usará la
  V2: `fuente`, `nivel_confianza`, `estado`, `fusionado_con`,
  `location_precision`, identificador de origen. `vigencia` se calcula a partir
  de la fecha
- **Un adaptador por fuente** en `backend/app/ingestion/`
- **Worker histórico** (`app/workers/historical_worker.py`) que revisa CKAN a
  diario y carga solo archivos nuevos. **No corre en producción**: CKAN bloquea
  la IP del VPS (403). Allí los datos se actualizan desde la máquina del
  desarrollador con `codigo/scripts/actualizar_datos.sh`, que descarga los
  archivos, los sube con `rsync` y ejecuta `python -m app.ingestion all --offline`
- **Tabla `pipeline_runs`**: cada ejecución queda registrada con registros
  procesados, duplicados y errores
- **Ingesta idempotente:** correrla dos veces da el mismo resultado
  (`UNIQUE(source_id, source_record_id)` y, por archivo, `pipeline_runs.file_hash`:
  un archivo ya cargado se salta)
- **Población por cantón** (proyecciones del INEC): la tasa de un año usa la
  población de ese mismo año

### Despliegue

- VPS Ubuntu 24.04 (2 vCPU, 3,8 GB de RAM) compartido con otros proyectos,
  Docker Compose (`compose.prod.yml` + `compose.behind-proxy.yml`). Un Caddy
  compartido, de otro proyecto, ocupa los puertos 80/443, da el HTTPS y envía
  el tráfico al contenedor `reporteec-web` por la red `caddy_net`
- Subdominio `reporteec.playhubb.site`, con el DNS en GoDaddy
- Respaldo diario de la base de datos: una tarea cron a las 08:00 UTC ejecuta
  `codigo/despliegue/backup.sh`
- Pasos en `codigo/despliegue/README.md` («Detrás de un Caddy compartido» y
  «Actualizar los datos»)
- **PWA instalable**, solo consulta

---

## Orden de desarrollo

| # | Tarea                                                  | Por qué en este orden                                    |
| - | ------------------------------------------------------ | --------------------------------------------------------- |
| 1 | Fase 0: esqueleto de punta a punta                     | Prueba el stack antes de invertir en funciones            |
| 2 | Modelo de datos definitivo                             | Cambiarlo después obliga a migrar todo                   |
| 3 | Ingesta de los tres datasets del Ministerio, con tests | Sin datos no hay mapa                                     |
| 4 | Mapa: capas, colores, íconos, mapa de calor, detalle  | Es el corazón del producto                               |
| 5 | Filtros                                                |                                                           |
| 6 | Población y estadísticas                             | La tasa necesita la población                            |
| 7 | Siniestros y riesgo de extorsión por cantón          | Otra forma de dibujar; coropletos y semáforos cantonales |
| 8 | Páginas: inicio, metodología, licencia y fuentes     | Explican lo que ya existe                                 |
| 9 | PWA, despliegue, respaldos                             | Para publicarlo                                           |

## Qué evitar

- **Adelantar funciones de la V2.** Nada de cuentas, Redis ni tiempo real. Lo
  único que se prepara es el modelo de datos.
- **Ingesta que duplica.** Se guarda el identificador de origen de cada
  registro para que volver a cargar no cree copias.
- **Probar solo con datos inventados.** Los tests del parser usan los XLSX
  reales: coma decimal, centinelas, datos en la segunda hoja
  ([[Esquema de Campos]]).
- **Mandar todos los puntos al navegador de una vez.** Son cientos de miles;
  el mapa se sirve en teselas.

---

## Cómo probarla tú mismo

Lista para revisar a mano antes de dar la V1 por terminada.

### Datos

- [x] Homicidios, desaparecidas y detenidos aparecen desde 2019
- [x] El total de homicidios de un año coincide con el total del archivo
  oficial de ese año
- [x] Ningún punto cae fuera de Ecuador *(2026-10-09: 0 de 654.226 puntos fuera
  del territorio, Galápagos incluido. Hay 4.021 fuera de los polígonos cantonales:
  zonas no delimitadas o junto a la costa, a 5 km como mucho, y 44 detenciones en
  el mar frente a Esmeraldas y Manabí, que parecen operativos marítimos)*
- [x] Correr la ingesta dos veces no duplica registros
- [x] Una persona desaparecida con fecha de localización no aparece en el mapa

### Mapa

- [x] Los puntos se ven al acercar y el mapa de calor al alejar
- [x] Los detenidos solo aparecen al activar su capa, y nunca mezclados con
  los incidentes
- [x] Cada marcador tiene el color y la forma de su tipo, y el estilo de trazo
  de su nivel de confianza
- [x] Tocar un punto muestra tipo, fecha, lugar, fuente y enlace
- [x] Cambiar de año no cambia el color de los marcadores
- [x] El mapa carga rápido con todos los años activados *(2026-10-09, 2019–2026:
  datos completos en 1,8 s con buena conexión y 8,6 s en 4G lento (1,6 Mbps); el
  mapa aparece a los 3 s. Igual que con un solo año, porque las teselas traen todos
  los años y el filtro es local. Acercar hasta ver puntos: unos 2,5 s. Sin errores)*

### Filtros y estadísticas

- [x] Filtrar por provincia, cantón, tipo, año y mes cambia el mapa y las cifras
- [x] Cada tasa aparece junto a su conteo
- [x] Los siniestros se ven por cantón

### Páginas

- [x] La página de inicio explica qué es la plataforma y cómo leer el mapa
- [x] La metodología explica conteo, tasa, niveles de confianza y denuncias
- [x] La página de licencia atribuye cada fuente

### Instalación

- [ ] La PWA se instala en Android y en iPhone
- [x] El sitio carga por HTTPS con el dominio propio

## Terminada cuando

Todas las casillas anteriores están marcadas y el sitio está publicado en el
dominio.
