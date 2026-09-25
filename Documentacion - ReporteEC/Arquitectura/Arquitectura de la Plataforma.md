---
tags: [arquitectura, plataforma, backend, postgis, fastapi]
actualizado: 2026-09-24
estado: aprobado
---

# Arquitectura de la Plataforma

> [!success] Documento oficial de arquitectura
> Actualizado el 2026-09-24 para consolidar las decisiones de diseño del sistema.
> Se adopta un **monolito modular** en Python (FastAPI) respaldado por **PostgreSQL 17 + PostGIS 3**, sirviendo teselas vectoriales directamente mediante **Martin** y un frontend reactivo con **MapLibre GL JS**.
> Se descartan microservicios, bases de datos secundarias (Redshift / Fabric) y colas pesadas innecesarias.

---

## 1. Principios de Diseño

1. **Monolito Modular:** Todo el código de negocio, modelos y adaptadores reside en un único repositorio (`codigo/backend`), pero organizado en módulos autónomos con fronteras claras. Los workers de tareas pesadas o recurrentes corren como procesos independientes compartiendo el mismo código base.
2. **PostGIS como Motor Central:** No se usan almacenes de datos analíticos secundarios. PostGIS maneja la persistencia transaccional (OLTP) y las consultas espaciales/analíticas (agregaciones, buffers de rutas, coropletos y conteos por cantón).
3. **Servicio Eficiente de Teselas (MVT):** Ante cientos de miles de puntos geográficos, el mapa no descarga GeoJSON masivo. Se utiliza **Martin** para generar teselas vectoriales Mapbox Vector Tiles (MVT) directamente desde consultas SQL en PostGIS.
4. **Trazabilidad y Niveles de Confianza:** Cada incidente conserva su linaje, fuente original, nivel de confianza (🟢 Oficial, 🔵 Verificado, 🟡 Reportado, 🟠 En revisión) y vigencia temporal ([[Niveles de Confianza]]).

---

## 2. Diagrama General de Arquitectura

```
                        USUARIOS / CLIENTES
       ┌─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
Navegadores Web (PWA)     Móviles (Android/iOS)      Clientes B2B (API)
       │                         │                         │
       └─────────────────────────┼─────────────────────────┘
                                 │ HTTPS (Puerto 443)
                                 ▼
                     ┌───────────────────────┐
                     │         Caddy         │  (Reverse Proxy + SSL Auto)
                     └───────────┬───────────┘
                                 │
            ┌────────────────────┴────────────────────┐
            │                                         │
    /api/*  ▼                         /tiles/*        ▼
┌───────────────────────┐                 ┌───────────────────────┐
│        FastAPI        │                 │        Martin         │
│  (Monolito Modular)   │                 │ (Servidor de Teselas) │
└───────────┬───────────┘                 └───────────┬───────────┘
            │                                         │
            └────────────────────┬────────────────────┘
                                 │ Consultas SQL / MVT
                                 ▼
                    ┌─────────────────────────┐
                    │  PostgreSQL 17 + PostGIS│
                    │   (Fuente de Verdad)    │
                    └────────────▲────────────┘
                                 │ Ingesta / Actualizaciones
                    ┌────────────┴────────────┐
                    │    Workers Backend      │
                    │  - historical_worker    │
                    │  - news_worker          │
                    │  - routes_worker        │
                    └─────────────────────────┘
```

---

## 3. Componentes del Stack

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| **Proxy & Seguridad** | **Caddy Server** | Terminación TLS automática con Let's Encrypt, compresión zstd/gzip, enrutamiento a FastAPI y Martin, protección básica anti-DDoS. |
| **API Backend** | **Python 3.12 + FastAPI** | Endpoints REST para filtros, estadísticas, autenticación de usuarios, suscripciones de zona, cálculo de riesgo en rutas y gestión de reportes. |
| **Generador de Teselas** | **Martin (Rust)** | Servidor de teselas vectoriales de alto rendimiento conectado a PostGIS. Responde en milisegundos para renderizar cientos de miles de incidentes en el mapa. |
| **Base de Datos** | **PostgreSQL 17 + PostGIS 3** | Motor geoespacial. Tablas normalizadas, particionamiento por año, índices espaciales GiST (`idx_incidents_geom`), funciones de agregación y buffers viales. |
| **Frontend** | **React + TypeScript + Vite** | PWA instalable con Tailwind CSS, interfaz fluida, gestión de estado ligero y cliente de mapas **MapLibre GL JS**. |
| **Almacenamiento** | **Azure Blob Storage / S3** | Almacenamiento seguro de fotografías adjuntas a reportes ciudadanos (V2), con eliminación previa de metadatos EXIF. |

---

## 4. Módulos Internos del Backend (`codigo/backend/app/`)

El backend se organiza en dominios desacoplados:

```
app/
├── api/                   # Rutas y controladores HTTP organizados por versión
│   ├── v1/                # Incidentes, estadísticas, límites cantonales, rutas
│   └── v2/                # Usuarios, autenticación, reportes ciudadanos, suscripciones
├── modules/               # Lógica de dominio puro
│   ├── incidents/         # Consultas de incidentes, reglas de confianza y vigencia
│   ├── ingestion/         # Adaptadores de extracción (CKAN, INEC, FGE, Policía)
│   ├── routes/            # Algoritmo de evaluación de riesgo en rutas por franja horaria
│   ├── extorsion/         # Métricas de riesgo comercial y denuncias por cantón
│   ├── spatial/           # Operaciones geométricas, buffers viales y geocodificación
│   └── notifications/     # Web Push y notificaciones zonales
├── models/                # Modelos SQLAlchemy / GeoAlchemy2
├── schemas/               # Esquemas de validación y serialización Pydantic
├── database/              # Conexión, pooling y migraciones con Alembic
└── workers/               # Procesos de fondo para sincronizaciones programadas
```

---

## 5. Modelo de Datos Central: Esquema Simplificado

### Tabla: `incidents` (Núcleo del Sistema)
```sql
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_origen VARCHAR(100),              -- ID en dataset fuente para idempotencia
    tipo VARCHAR(50) NOT NULL,               -- Homicidio, robo, extorsión, etc.
    nivel_confianza VARCHAR(20) NOT NULL,    -- oficial, verificado, reportado, en_revision
    vigencia VARCHAR(20) NOT NULL,           -- reciente, historico
    fuente VARCHAR(50) NOT NULL,             -- mdi_homicidios, fge_extorsion, reporte_ciudadano, etc.
    fecha_hecho DATE NOT NULL,
    hora_hecho TIME,
    precision_ubicacion VARCHAR(20),         -- punto_gps, manzana, parroquia, canton
    geom GEOMETRY(Point, 4326),              -- Coordenada espacial
    canton_id VARCHAR(10) REFERENCES cantones(codigo_dpa),
    detalles JSONB,                          -- Metadatos particulares de cada fuente
    estado VARCHAR(20) DEFAULT 'activo',     -- activo, fusionado, retirado_falso
    fusionado_con UUID REFERENCES incidents(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_incidents_geom ON incidents USING GIST (geom);
CREATE INDEX idx_incidents_fecha ON incidents (fecha_hecho);
CREATE INDEX idx_incidents_tipo ON incidents (tipo);
CREATE INDEX idx_incidents_confianza ON incidents (nivel_confianza);
```

### Tabla: `territorios_dpa` (Límites Oficiales)
* `codigo_dpa`: Código oficial INEC (ej. `0901` Guayaquil).
* `nombre`: Nombre del cantón o provincia.
* `geom`: Polígono `MultiPolygon, 4326` de los límites oficiales (CONALI/INEC).
* `poblacion_censo`: Población para normalizar tasas por 100.000 habitantes.
* `indice_riesgo_comercial`: Score precalculado de extorsión y vacunas a negocios.

---

## 6. Estrategia de Rendimiento y Escalabilidad

1. **Pre-cálculo y Caché en Caddy:** Las teselas vectoriales de años históricos cerrados (2019–2025) y de niveles de zoom nacionales/provinciales (z0 a z8) son inmutables. Caddy almacena en caché estas respuestas para que ni siquiera toquen a Martin ni a PostGIS.
2. **Server-Sent Events (SSE) para Tiempo Real:** En la V2, las actualizaciones de incidentes se transmiten al cliente web mediante SSE desde FastAPI sobre `LISTEN/NOTIFY` de PostgreSQL. Es más ligero, compatible con HTTP/2 y fácil de mantener que una infraestructura de WebSockets redundante.
3. **Manejo de Carga en 2 vCPU / 4 GB:** El stack no requiere clústeres externos. Con límites de memoria en Docker Compose, PostGIS configurado para 1.5 GB de RAM efectiva y FastAPI corriendo con Uvicorn en 2 workers, el consumo en reposo es inferior a 800 MB de RAM.
