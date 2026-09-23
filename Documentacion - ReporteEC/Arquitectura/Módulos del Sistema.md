---
tags: [arquitectura, modulos, estructura]
actualizado: 2026-09-22
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
│   │   ├── main.py          arranque de la API
│   │   ├── api/             rutas HTTP (incidentes, estadísticas, fuentes, monitoreo…)
│   │   ├── modules/         lógica de negocio, un módulo por dominio
│   │   │   ├── incidents/
│   │   │   ├── sources/
│   │   │   ├── ingestion/   adaptadores de fuente (un adaptador por fuente)
│   │   │   ├── geocoding/
│   │   │   ├── ai/          (futuro) extracción desde texto libre
│   │   │   ├── telegram/    (futuro) fuentes colaboradoras
│   │   │   ├── storage/     imágenes: Azure Blob hoy, S3 mañana (v2)
│   │   │   └── monitoring/
│   │   ├── workers/         procesos que corren aparte de la API
│   │   │   ├── historical_worker.py   ingesta de datos oficiales (v1)
│   │   │   ├── news_worker.py         noticias de la Policía (v2)
│   │   │   └── processing_worker.py   IA + geocodificación (futuro)
│   │   ├── database/        conexión y sesión
│   │   ├── models/          tablas
│   │   ├── schemas/         formatos de entrada y salida de la API
│   │   └── core/            configuración y utilidades comunes
│   ├── migrations/          PostGIS: tablas y funciones para teselas
│   └── tests/
├── frontend/                PWA con el mapa (React + TypeScript + Vite + MapLibre)
├── despliegue/              VPS: Docker Compose, Caddy, Martin, respaldos
└── scripts/                 utilidades de inspección
```

## Flujo de datos

```
 Fuentes externas                    Servidor                        Usuario
 ────────────────                    ────────                        ───────
 CKAN (Min. Interior) ─┐
 INEC (siniestros,     ├─► workers ─► PostgreSQL + PostGIS ─┬─► servidor de teselas ─┐
       población)      │   (backend)       (tabla única      │                        ├─► frontend (PWA, mapa)
 [v2] Noticias Policía ┘                    de incidentes)   └─► backend ─────────────┘
                                                  ▲               │
 [v2] Reportes ciudadanos ──────────────────── backend ◄──────────┘
```

## Responsabilidad de cada módulo

### backend — ingesta (`modules/ingestion/` + `workers/`)

Un **adaptador por fuente**, todos con la misma interfaz:

1. **descargar** — obtiene los archivos o registros nuevos
2. **normalizar** — convierte al modelo común (coma decimal, nombres de
   columna, centinelas: ver [[Esquema de Campos]])
3. **cargar** — inserta o actualiza en la tabla única de incidentes

| Adaptador | Versión |
|---|---|
| `mdi_homicidios`, `mdi_desaparecidas`, `mdi_detenidos` | v1 |
| `inec_siniestros` (por cantón) | v1 |
| `inec_poblacion` | v1 |
| `policia_noticias` | v2 |
| `telegram` | V3 — ver [[Telegram - Fuentes Colaboradoras]] |

### backend — esquema (`migraciones/`)

- **Tabla única de incidentes** con geometría `Point, 4326`, tipo,
  `nivel_confianza`, `vigencia`, `fuente`, `estado`, `fusionado_con`
- Tabla de **cantones y provincias** (límites y códigos) para filtros,
  siniestros y tasas
- Tabla de **población** por cantón y año
- **Funciones SQL** que generan las teselas del mapa filtradas por año, tipo y
  zona
- v2: usuarios, reportes, votos, suscripciones de zona

### backend — API (`app/`)

- v1: filtros, estadísticas (conteo y tasa), detalle de un incidente
- v2: cuentas, reportes, votos, moderación, suscripciones, flujo en tiempo
  real, notificaciones

### despliegue — servidor de teselas

Sirve el mapa en **teselas vectoriales** generadas en PostGIS. Es necesario
porque son cientos de miles de puntos: mandarlos todos al navegador de una vez
sería lentísimo.

### backend — almacenamiento (`almacenamiento/`, v2)

Las imágenes de los reportes ciudadanos se guardan en un bucket. El código usa
una **interfaz propia** (subir, obtener URL, borrar) con una implementación
para **Azure Blob Storage** ahora y otra para **Amazon S3** cuando se migre.
Cambiar de proveedor es cambiar la configuración, no el código.

### frontend

- Mapa, filtros, estadísticas, etiquetas de confianza, nota metodológica
- PWA instalable
- v2: vista «Actualidad», aviso lateral, formulario de reporte, suscripciones
