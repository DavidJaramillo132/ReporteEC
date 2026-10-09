---
tags: [arquitectura, stack, infraestructura]
actualizado: 2026-10-09
---
# Stack e Infraestructura

> [!success] Estado
> **Stack aprobado el 2026-09-22.** Todas las piezas son open source, maduras
> y usadas en producción. La prueba definitiva es el primer esqueleto
> funcionando de punta a punta (ver al final). Carpetas en
> [[Módulos del Sistema]].

## Recomendación

| Capa                    | Tecnología                                        | Por qué                                                                                       |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Base de datos           | **PostgreSQL 17 + PostGIS 3**                | Estándar para datos geográficos. Los datos ya vienen en WGS84                                |
| Ingesta (ETL y scraper) | **Python 3.12**                              | Lo mejor para leer XLSX/CSV, limpiar datos y consumir APIs. Los scripts actuales ya son Python |
| Gestor del backend      | **uv**                                       | Crea el entorno, fija Python 3.12, instala dependencias y las congela en`uv.lock`            |
| Gestor del frontend     | **Bun**                                      | Instala dependencias y ejecuta Vite. Solo se usa para desarrollar y construir                  |
| API                     | **FastAPI** (Python)                         | Mismo lenguaje que la ingesta: un solo lenguaje en todo el servidor                            |
| Teselas del mapa        | **Martin**                                   | Servidor de teselas del propio proyecto MapLibre; genera el mapa directo desde PostGIS         |
| Rutas                   | **OSRM** (`osrm-backend` v6.0.0, perfil auto, MLD) | Servidor de rutas propio con el mapa abierto de OpenStreetMap; sin API de terceros. Ver más abajo |
| Frontend                | **React + TypeScript + Vite + Tailwind CSS** | Aplicación centrada en el mapa; Vite es simple y rápido                                      |
| Mapa                    | **MapLibre GL JS**                           | Ya elegido. Tiene capa de mapa de calor nativa                                                 |
| PWA                     | **vite-plugin-pwa**                          | Instalación, service worker y, en v3, notificaciones                                          |
| Contenedores            | **Docker Compose**                           | Todo el sistema se levanta con un comando, igual en local y en el servidor                     |
| Servidor web            | **Caddy**                                    | Ya elegido. HTTPS automático                                                                  |
| Servidor                | **VPS Ubuntu Server en Azure**               | Ya elegido. Para empezar alcanza con 2 vCPU y 4 GB de RAM                                      |
| Dominio                 | **GoDaddy**                                  | Ya elegido. Solo apunta al IP del VPS                                                          |

### Rutas con OSRM (V2)

El riesgo en rutas traza el camino con **OSRM** (imagen `ghcr.io/project-osrm/osrm-backend:v6.0.0`), con el mapa de Ecuador de OpenStreetMap, perfil de auto y algoritmo MLD. Corre como el servicio `osrm`, solo dentro de la red de Docker (sin puerto publicado). Los datos se preparan en la máquina del desarrollador con `codigo/scripts/preparar_osrm.sh` (en el VPS no alcanza la memoria) y se suben al servidor. En producción usa unos 660 MiB y tiene un límite de 1024 MB (`mem_limit` en `codigo/despliegue/compose.behind-proxy.yml`). Pasos en `codigo/despliegue/README.md` («Rutas (OSRM)»). El módulo `routing` del backend lo consume ([[Módulos del Sistema]]).

### Solo para la v3

| Necesidad              | Tecnología                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tiempo real en el mapa | **Server-Sent Events** desde FastAPI + `LISTEN/NOTIFY` de PostgreSQL                                                              |
| Notificaciones         | **Web Push** con claves VAPID (`pywebpush` en el servidor)                                                                        |
| Imágenes de reportes  | **Azure Blob Storage** ahora y **Amazon S3** en el futuro, detrás de una interfaz propia (módulo de almacenamiento, aún no existe) |

### Almacenamiento analítico unificado

PostgreSQL 17 con PostGIS 3 asume tanto el rol operacional (OLTP) como el analítico (OLAP). Con menos de 1 millón de registros esperados en la fase actual, la combinación de particionamiento anual, índices GiST espaciales y vistas materializadas resuelve las consultas estadísticas y de agregación en milisegundos, eliminando la necesidad de almacenes de datos externos (Data Warehouses).

## Decisiones cerradas por esta recomendación

**«Posgrest» es PostgreSQL, no PostgREST.** PostgREST genera una API
automática, pero la v3 necesita lógica propia (votos, moderación, límites,
notificaciones) que encaja mejor en FastAPI. Resuelve el riesgo 5 de
[[Riesgos Abiertos]].

**Vite en lugar de Next.js.** El `.gitignore` del repositorio es de Next.js,
pero para esta aplicación Next no aporta mucho: el mapa se dibuja en el
navegador de todas formas, y su renderizado en servidor suma complejidad. Además,
su integración con PWA depende de librerías de terceros menos estables.
Next.js tendría sentido si más adelante se quieren páginas de estadísticas
optimizadas para buscadores. Si se aprueba Vite, conviene limpiar el
`.gitignore`.

**Mapa de calor y puntos sin hexágonos.** Al elegir mapa de calor (punto 11),
MapLibre lo resuelve de forma nativa. No hace falta H3.

## Entorno de desarrollo

> [!success] Decidido el 2026-09-24
> **Bun** para el frontend y **uv** para el backend.

### Frontend con Bun

```bash
cd codigo/frontend

bun create vite . --template react-ts        # Vite + React + TypeScript
bun install
bun add maplibre-gl tailwindcss @tailwindcss/vite
bun add -d vite-plugin-pwa
```

Por defecto Vite corre con Node aunque se lance con Bun, porque su ejecutable
declara Node en la primera línea. Para que corra con Bun, el script `dev` de
`package.json` debe ser:

```json
"dev": "bunx --bun vite"
```

| Comando           | Para qué                               |
| ----------------- | --------------------------------------- |
| `bun run dev`   | Servidor de desarrollo                  |
| `bun run build` | Genera los archivos finales en`dist/` |

**Bun no corre en el servidor.** En producción Caddy sirve los archivos
estáticos de `dist/`.

### Backend con uv

```bash
cd codigo/backend

uv init --app --name reporteec-backend --python 3.12
rm main.py        # uv crea uno de ejemplo; el nuestro va en app/main.py

uv add "fastapi[standard]" sqlalchemy geoalchemy2 "psycopg[binary]" alembic httpx
uv add --dev pytest ruff
```

| Comando                                            | Para qué                     |
| -------------------------------------------------- | ----------------------------- |
| `uv run fastapi dev app/main.py`                 | La API en desarrollo          |
| `uv run python -m app.workers.historical_worker` | Un worker                     |
| `uv run python -m app.ingestion <comando>`       | Cargar datos (CLI de ingesta) |
| `uv run pytest`                                  | Tests                         |
| `uv run ruff check`                              | Revisión de estilo y errores |

El sistema tiene Python 3.14, pero con `--python 3.12` uv descarga y usa esa
versión solo para el proyecto, sin tocar la del sistema.

En Docker se copia uv a la imagen y se instala con `uv sync --frozen`, que
respeta exactamente `uv.lock`:

```dockerfile
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
RUN uv sync --frozen --no-cache
```

### Con Docker (desarrollo)

`codigo/docker-compose.yml` levanta todo el entorno de desarrollo:
PostgreSQL + PostGIS, Martin, backend y frontend, con recarga automática al
editar el código. El compose de producción está en
`codigo/despliegue/` (`compose.prod.yml`).

| Archivo                        | Para qué                                          |
| ------------------------------ | -------------------------------------------------- |
| `codigo/docker-compose.yml`  | Define los cuatro servicios                        |
| `codigo/backend/Dockerfile`  | Imagen del backend con uv (etapa`dev`)           |
| `codigo/frontend/Dockerfile` | Imagen del frontend con Bun (etapa`dev`)         |
| `codigo/.env.example`        | Plantilla de variables,**sí** se sube a git |
| `codigo/.env`                | Tus valores reales,**no** se sube a git      |

```bash
cd codigo
docker compose up --build   # levantar
docker compose down         # detener (conserva la base de datos)
docker compose down -v      # detener y borrar la base de datos
```

Si falta el `.env`, el compose se detiene y dice qué variable falta. Las
imágenes usan nombres completos de registro (`docker.io/…`, `ghcr.io/…`), así
que también funcionan con Podman.

### Archivos de bloqueo

**`uv.lock` y `bun.lock` se suben a git.** Guardan las versiones exactas de
cada dependencia, para que la computadora de desarrollo, el VPS y cualquier
colaborador instalen exactamente lo mismo.

## Infraestructura

```
Internet ─► GoDaddy (DNS) ─► VPS Ubuntu (Azure, compartido con otros proyectos)
                              ├─ Caddy compartido (de otro proyecto: puertos 80/443, HTTPS)
                              │     └─ red Docker `caddy_net` ─► reporteec-web
                              └─ Docker Compose (compose.prod.yml + compose.behind-proxy.yml)
                                  ├─ Caddy        (reporteec-web: sirve la PWA, /api y /tiles)
                                  ├─ frontend     (archivos estáticos de la PWA)
                                  ├─ backend      (FastAPI)
                                  ├─ martin       (teselas)
                                  ├─ osrm         (rutas; solo red interna)
                                  ├─ postgres     (PostgreSQL + PostGIS)
                                  └─ worker       (ingesta; apagado en producción)
```

La V1 está publicada en https://reporteec.playhubb.site. El VPS es Ubuntu 24.04
con 2 vCPU y 3,8 GB de RAM. Los pasos están en `codigo/despliegue/README.md`
(«Detrás de un Caddy compartido» y «Actualizar los datos»).

- **Respaldo diario** de la base de datos: una tarea cron en el servidor
  (08:00 UTC) ejecuta `codigo/despliegue/backup.sh`.
- **Tareas programadas:** el `historical_worker` está pensado para revisar
  CKAN a diario y cargar solo si hay archivos nuevos, pero **no corre en
  producción**: `datosabiertos.gob.ec` responde 403 a la IP del VPS. Los datos
  se actualizan desde la máquina del desarrollador con
  `codigo/scripts/actualizar_datos.sh` (descarga, `rsync` al servidor y
  `python -m app.ingestion all --offline`). La V3 consultará las noticias de la
  Policía cada pocos minutos.
- Los datos crudos descargados **no se versionan** (`codigo/data/raw/`).

## Primer paso técnico: esqueleto de punta a punta

Antes de construir funciones, levantar el camino completo con un solo
dataset: Docker Compose → PostGIS → ingesta de homicidios 2026 → Martin →
mapa en el navegador mostrando los puntos. Si ese camino funciona, el stack
queda probado y el resto es sumar capas y filtros.
