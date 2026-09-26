---
tags: [desarrollo, guia, pasos, implementacion, hoja-tecnica]
actualizado: 2026-09-24
---

# Guía de Desarrollo e Implementación Técnica

> [!abstract] Propósito de esta guía
> Este documento establece la **secuencia de construcción técnica paso a paso** para el desarrollo de ReporteEC.
> Define exactamente qué archivos crear, qué comandos ejecutar y qué verificar en cada fase, asegurando que el avance sea en **rebanadas verticales** (funcionalidades de punta a punta) sin escribir código innecesario ni saltarse etapas.

---

## 1. Principio Fundamental: Rebanadas Verticales

No se construye primero todo el backend y luego todo el frontend. Cada etapa se completa de extremo a extremo:
$$\text{Datos crudos} \longrightarrow \text{Base de Datos (PostGIS)} \longrightarrow \text{API / Teselas (Martin)} \longrightarrow \text{Frontend (Mapa)}$$

Si una etapa no muestra un resultado tangible en pantalla o en terminal, no se pasa a la siguiente.

---

## 2. Mapa de Fases de Construcción

```
FASE 0: Esqueleto de Punta a Punta (Cimientos)
   │
   ▼
FASE 1: V1 — Observatorio Histórico y Riesgo Comercial
   │
   ▼
FASE 2: V2 — Rutas Seguras e Inteligencia Horaria (Monetización B2B)
   │
   ▼
FASE 3: V3 — Comunidad y Tiempo Real (Reportes y Moderación)
   │
   ▼
FASE 4: V4 — Red Colaborativa e Inteligencia Artificial
```

---

## 3. FASE 0: El Esqueleto de Punta a Punta (Paso Inmediato)

> **Meta:** Levantar la infraestructura local mínima y ver el primer punto real del Ministerio del Interior dibujado en el mapa del navegador en menos de 30 minutos de trabajo.

### Paso 0.1: Entorno de Infraestructura Local
* **Ubicación:** `codigo/despliegue/`
* **Acción:** Crear `docker-compose.yml` conteniendo:
  - `postgres`: Imagen `postgis/postgis:17-3.5` con persistencia en volumen y configuración optimizada (1.5 GB de memoria compartida).
  - `martin`: Imagen `ghcr.io/maplibre/martin` configurada para conectarse a PostGIS y exponer teselas en el puerto `3000`.
* **Verificación:** Correr `docker compose up -d` y comprobar con `psql` que la extensión PostGIS esté activa (`SELECT PostGIS_Version();`).

### Paso 0.2: Entorno Backend y Esquema Inicial
* **Ubicación:** `codigo/backend/`
* **Acción:**
  - Inicializar proyecto con **uv** (`pyproject.toml` con FastAPI, SQLAlchemy 2.0, GeoAlchemy2, psycopg 3 (síncrono), Alembic, pydantic).
  - Crear configuración central en `app/core/config.py` leyendo variables de `.env`.
  - Crear modelo `incidents` en `app/models/incident.py` con campo geométrico `geom GEOMETRY(Point, 4326)`.
  - Generar migración inicial con Alembic.

### Paso 0.3: Ingesta del Primer Dataset (Homicidios 2026)
* **Ubicación:** `codigo/backend/app/modules/ingestion/`
* **Acción:**
  - Crear adaptador `mdi_homicidios.py` que tome el archivo XLSX de homicidios 2026.
  - Normalizar coordenadas (`coordenada_y` = latitud, `coordenada_x` = longitud, reemplazando coma decimal por punto).
  - Insertar en la tabla `incidents` asignando `tipo = 'homicidio'`, `nivel_confianza = 'oficial'`, `vigencia = 'reciente'`.
* **Verificación:** Ejecutar consulta SQL `SELECT COUNT(*), ST_AsText(geom) FROM incidents;` y confirmar que los puntos caen en territorio ecuatoriano.

### Paso 0.4: Exposición de Teselas con Martin
* **Acción:**
  - Configurar función SQL o tabla fuente en Martin para servir la capa `incidents`.
* **Verificación:** Abrir en el navegador o con `curl` `http://localhost:3000/incidents/6/31/32.pbf` y recibir respuesta binaria MVT con código HTTP 200.

### Paso 0.5: Verificación Visual en Frontend Mínimo
* **Ubicación:** `codigo/frontend/`
* **Acción:**
  - Inicializar aplicación web con Vite + React + TypeScript + Tailwind CSS.
  - Instalar `maplibre-gl`.
  - Añadir la fuente de teselas de Martin (`http://localhost:3000/incidents/{z}/{x}/{y}`) con una capa de círculos verdes (🟢 Oficial).
* **Criterio de éxito de la Fase 0:** Los homicidios de 2026 se ven como puntos interactivos sobre el mapa de Ecuador en el navegador local.

---

## 4. FASE 1: V1 — Observatorio Histórico y Riesgo Comercial

Detalle completo en [[V1 - Mapa Histórico]].

1. **Carga de Geometrías DPA:**
   - Cargar `cantones_ecuador_simplificado.geojson` en la tabla `territorios_dpa`.
   - Crear índices espaciales GiST sobre los polígonos cantonales.
2. **Carga de Población INEC (2010–2035):**
   - Procesar `Total_cantonal_2010-2035.xlsx` y cargar la serie histórica cantonal en `poblacion_cantones`.
3. **Ingesta Completa del Ministerio del Interior (2019–2026):**
   - Adaptador de Desaparecidas (gestión de casos localizados vs. activos).
   - Adaptador de Detenidos (capa de actividad policial en mapa de calor independiente).
4. **Siniestros de Tránsito INEC y Extorsión FGE/OECO:**
   - Cálculo de coropletos y **Semáforo de Riesgo Comercial para Negocios** cantonal ([[Extorsión y Vacunas a Negocios]]).
5. **Cálculo de Tasas:**
   - Endpoints de estadísticas en FastAPI que cruzan delitos con población: $\text{Tasa} = \frac{\text{Conteo}}{\text{Población}} \times 100.000$.
6. **Páginas Institucionales:**
   - Página de Inicio con explicador de niveles de confianza.
   - Página de Metodología (explicación de denuncias, tasas vs. conteo y subregistro).
   - Términos de licencia de datos abiertos y descargo de responsabilidad.

---

## 5. FASE 2: V2 — Rutas Seguras e Inteligencia Horaria

Detalle completo en [[V2 - Rutas e Inteligencia Horaria]] y [[Riesgos en Rutas por Horario]].

1. **Red Vial Nacional:**
   - Importar la red de carreteras estatales y avenidas urbanas principales en PostGIS.
2. **Motor de Intersección Espacio-Temporal:**
   - Función SQL `evaluar_ruta_horario(linea_geom, hora_salida)`:
     - Genera buffer de 200m (urbano) o 1.000m (carretera).
     - Intersecta con incidentes históricos.
     - Pondera según franja horaria (madrugada $\times 1.6$, noche $\times 1.3$).
3. **Gráfico Horario 24h en Frontend:**
   - Componente visual que ilustra la curva de riesgo hora por hora para la ruta seleccionada.
4. **Detección de Tramos Críticos (*Blackspots*):**
   - Marcadores de advertencia en segmentos viales con alta concentración de delitos.
5. **API REST B2B:**
   - Autenticación por API Key para empresas de transporte y monitoreo satelital ([[Modelo de Monetización]]).

---

## 6. FASE 3: V3 — Comunidad y Tiempo Real

Detalle completo en [[V3 - Tiempo Real y Comunidad]].

1. **Autenticación y Cuentas:**
   - Registro de usuarios con confirmación obligatoria por correo electrónico.
2. **Formulario Móvil de Reportes:**
   - Selección de tipo ([[Tipos de Incidente]]), GPS aproximado (manzana) y subida de foto.
   - Worker de backend que remueve metadatos EXIF de las imágenes y las sube al bucket de almacenamiento.
3. **Canal de Tiempo Real (SSE):**
   - Endpoint Server-Sent Events en FastAPI apoyado en `LISTEN/NOTIFY` de PostgreSQL.
4. **Sistema de Moderación y Votos:**
   - Reportes nacen en 🟠 **En revisión**.
   - Votación comunitaria de sospecha y panel de moderador para retiro y suspensión de cuentas.
5. **Notificaciones Web Push Zonales:**
   - Suscripción por barrios/polígonos usando llaves VAPID (`pywebpush`).
6. **Scraper de Noticias Policiales:**
   - Worker que consume la API REST de WordPress de la Policía Nacional ([[Scraper Noticias Policía]]).

---

## 7. FASE 4: V4 — Red Colaborativa e Inteligencia Artificial

Detalle completo en [[V4 - Red Colaborativa e IA]].

1. **Conector con Telegram:**
   - Bot oficial de ReporteEC integrado en canales colaboradores autorizados.
   - Persistencia inmutable del mensaje de texto crudo para trazabilidad legal.
2. **Worker de Procesamiento NLP / LLM:**
   - Prompt estructurado para descartar spam, clasificar delito y extraer nombres de lugares.
   - Guardado de la métrica `extraction_confidence`.
3. **Geocodificador de Jerga Local:**
   - Conversión de intersecciones y referencias populares ecuatorianas a coordenadas con indicador de precisión (`location_precision`).
4. **Desduplicación Automática:**
   - Fusión de noticias coincidentes provenientes de múltiples canales sobre el mismo evento.
5. **Panel de Monitoreo Operativo:**
   - Métricas de salud de fuentes, tiempos de respuesta y registros en cola de revisión.

---

## 8. Qué hacer exactamente a continuación

Cuando des la orden de empezar con el código:
1. **No tocaremos el frontend ni la lógica compleja todavía.**
2. Iremos directamente a la **Fase 0.1 y 0.2**:
   - Crear `codigo/despliegue/docker-compose.yml`.
   - Inicializar el backend en `codigo/backend/` con `pyproject.toml` usando `uv`.
   - Levantar PostGIS y probar la conexión.
