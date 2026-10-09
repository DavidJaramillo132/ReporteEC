---
tags: [arquitectura, modulos, estructura]
actualizado: 2026-10-09
---
# Módulos del Sistema

Cómo se divide el sistema para que cada versión de la [[Hoja de Ruta]] se sume
sin rehacer lo anterior. Tecnologías concretas en [[Stack e Infraestructura]].

## Estructura de `codigo/`

> [!success] Decidido el 2026-09-23
> El backend es un **monolito modular**: API, ingesta y workers comparten una
> sola base de código, porque la IA, la geocodificación y la detección de
> duplicados las usan tanto la ingesta como la API (los reportes ciudadanos
> también se geocodifican). Cada worker **corre como proceso y contenedor
> propio**, así que uno puede fallar sin tumbar a los demás. Frontend y
> despliegue siguen en carpetas separadas. Reemplaza la carpeta `ingesta/`
> separada decidida el 2026-09-22.

```
codigo/
├── backend/                 Monolito modular (Python + FastAPI)
│   ├── app/
│   │   ├── main.py          arranque de la API (monta los routers bajo /api)
│   │   ├── core/            configuración, zona horaria y rango de años
│   │   ├── database/        conexión, sesión, tipos y vistas (`map_incidents`…)
│   │   ├── modules/         lógica de negocio, un módulo por dominio
│   │   │   ├── incidents/   modelos, esquemas, servicio (consultas) y router
│   │   │   ├── detentions/  modelos de detenidos y aprehendidos
│   │   │   ├── sources/     fuentes oficiales y su licencia
│   │   │   ├── territory/   provincias, cantones, población e indicadores cantonales
│   │   │   ├── stats/       conteos y tasas por 100.000 hab.
│   │   │   ├── meta/        estado de la carga de datos
│   │   │   ├── routing/     V2: riesgo en rutas por hora (OSRM, puntaje, escala de referencia)
│   │   │   └── …            futuro: notifications, almacenamiento (aún no existen)
│   │   ├── ingestion/       pipeline de datos (no es un dominio de negocio)
│   │   │   ├── __main__.py  CLI: `python -m app.ingestion <comando>`
│   │   │   ├── jobs.py      tareas que usan la CLI y el worker
│   │   │   ├── sources/     cliente CKAN y registro de fuentes
│   │   │   ├── readers/     lectura de xlsx
│   │   │   ├── adapters/    un adaptador por fuente (mdi_*, oeco_extorsion, inec_siniestros)
│   │   │   ├── loaders/     carga a la base: incidentes, territorio, indicadores, unidades admin.
│   │   │   ├── records.py   registro normalizado común
│   │   │   └── models.py    `PipelineRun` (historial de corridas)
│   │   └── workers/         procesos que corren aparte de la API
│   │       ├── historical_worker.py   ingesta de datos oficiales (v1; no corre en producción)
│   │       ├── news_worker.py         noticias de la Policía (v3)
│   │       └── processing_worker.py   IA + geocodificación (futuro)
│   ├── migrations/          PostGIS: tablas y funciones para teselas
│   └── tests/
├── frontend/                PWA con el mapa (React + TypeScript + Vite + MapLibre)
├── despliegue/              VPS: Docker Compose, Caddy, Martin, respaldos
└── scripts/                 utilidades de inspección y `actualizar_datos.sh` (actualiza los datos de producción)
```

## Flujo de datos

```Shell
 Fuentes externas                    Servidor                        Usuario
 ────────────────                    ────────                        ───────
 CKAN (Min. Interior) ─┐
 INEC (siniestros,     ├─► workers ─► PostgreSQL + PostGIS ─┬─► servidor de teselas ─┐
       población)      │   (backend)       (tabla única      │                        ├─► frontend (PWA, mapa)
 [v3] Noticias Policía ┘                    de incidentes)   └─► backend ─────────────┘
                                                  ▲               │
 [v3] Reportes ciudadanos ──────────────────── backend ◄──────────┘
```

## Responsabilidad de cada módulo

### backend — ingesta (`app/ingestion/` + `app/workers/`)

Un **adaptador por fuente**, todos con la misma interfaz:

1. **descargar** — obtiene los archivos o registros nuevos
2. **normalizar** — convierte al modelo común (coma decimal, nombres de
   columna, centinelas: ver [[Esquema de Campos]])
3. **cargar** — inserta o actualiza en la tabla única de incidentes

| Adaptador                                                    | Versión  |
| ------------------------------------------------------------ | --------- |
| `mdi_homicidios`, `mdi_desaparecidas`, `mdi_detenidos` | v1        |
| `oeco_extorsion` (noticias del delito FGE / OECO)            | v1        |
| `inec_siniestros` (por cantón)                            | v1        |
| población INEC (cargador `loaders/territory.py`, sin adaptador propio) | v1        |
| `policia_noticias`                                         | v3        |
| `telegram`                                                 | V3 — ver[[Telegram - Fuentes Colaboradoras]] |

> [!info] En producción
> `datosabiertos.gob.ec` bloquea la IP del VPS (403), así que el worker diario
> no corre allí. Los datos se actualizan desde la máquina del desarrollador con
> `codigo/scripts/actualizar_datos.sh`, que sube los archivos al servidor y
> ejecuta `python -m app.ingestion all --offline`.

### backend — esquema (`migrations/`)

- **Tabla única de incidentes** con geometría `Point, 4326`, tipo,
  `nivel_confianza`, `vigencia`, `fuente`, `estado`, `fusionado_con`
- Tabla de **cantones y provincias** (límites y códigos DPA) para filtros,
  siniestros, riesgo comercial de extorsión y tasas
- Tabla de **red vial y corredores** para cálculo de buffers y evaluación de riesgo en rutas
- Tabla de **población** por cantón y año
- **Vistas de solo lectura** `map_incidents` y `map_detentions` (v1): year/month
  ya calculados en hora local (America/Guayaquil), con la misma regla de
  visibilidad que usa la API (`status='activo'`, sin `located_at`,
  `location_precision <> 'canton'`, desde 2019). Son la única fuente que Martin
  publica como teselas, y la API las reutiliza (unidas a `incidents`/`sources`/
  `admin_units`) para no duplicar esa regla en dos lugares
- v3: usuarios, reportes, votos, suscripciones de zona

### backend — API (`app/`)

- v1: filtros, estadísticas (conteo y tasa), detalle de un incidente
- V2: `GET /api/routes/risk` y `GET /api/places/search` (módulo `routing`)
- v3: cuentas, reportes, votos, moderación, suscripciones, flujo en tiempo
  real, notificaciones

### backend — rutas (`app/modules/routing/`)

Calcula el riesgo de un trayecto por hora de salida. `osrm.py` llama al servicio OSRM; `geometry.py` corta la ruta en tramos de 1 km; `scoring.py` tiene la matemática pura (recencia, curva de 24 horas, exposición, franjas, percentil); `service.py` cruza la ruta con los incidentes en PostGIS y guarda en memoria las rutas recientes; `reference.py` genera la escala de referencia, que se guarda en la tabla `route_risk_reference` con el trabajo `python -m app.ingestion route-reference`. Método completo en [[Riesgos en Rutas por Horario]].

### despliegue — servidor de teselas

Sirve el mapa en **teselas vectoriales** generadas en PostGIS. Es necesario
porque son cientos de miles de puntos: mandarlos todos al navegador de una vez
sería lentísimo. Martin (v1) publica **solo** `map_incidents` y
`map_detentions` como fuentes de tabla, con descubrimiento automático
desactivado (`auto_publish: false`): nunca expone `incidents`, `detentions`
ni ninguna otra tabla directamente.

### backend — almacenamiento (módulo futuro, ligado a los reportes ciudadanos de la V3; aún no creado)

Las imágenes de los reportes ciudadanos se guardan en un bucket. El código usa
una **interfaz propia** (subir, obtener URL, borrar) con una implementación
para **Azure Blob Storage** ahora y otra para **Amazon S3** cuando se migre.
Cambiar de proveedor es cambiar la configuración, no el código.

### frontend

- Mapa, filtros, estadísticas, etiquetas de confianza, nota metodológica
- PWA instalable
- v3: vista «Actualidad», aviso lateral, formulario de reporte, suscripciones
