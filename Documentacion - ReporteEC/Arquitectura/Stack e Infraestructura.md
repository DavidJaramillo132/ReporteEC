---
tags: [arquitectura, stack, infraestructura]
actualizado: 2026-09-22
---

# Stack e Infraestructura

> [!success] Estado
> **Stack aprobado el 2026-09-22.** Todas las piezas son open source, maduras
> y usadas en producción. La prueba definitiva es el primer esqueleto
> funcionando de punta a punta (ver al final). Carpetas en
> [[Módulos del Sistema]].

## Recomendación

| Capa | Tecnología | Por qué |
|---|---|---|
| Base de datos | **PostgreSQL 17 + PostGIS 3** | Estándar para datos geográficos. Los datos ya vienen en WGS84 |
| Ingesta (ETL y scraper) | **Python 3.12** | Lo mejor para leer XLSX/CSV, limpiar datos y consumir APIs. Los scripts actuales ya son Python |
| API | **FastAPI** (Python) | Mismo lenguaje que la ingesta: un solo lenguaje en todo el servidor |
| Teselas del mapa | **Martin** | Servidor de teselas del propio proyecto MapLibre; genera el mapa directo desde PostGIS |
| Frontend | **React + TypeScript + Vite + Tailwind CSS** | Aplicación centrada en el mapa; Vite es simple y rápido |
| Mapa | **MapLibre GL JS** | Ya elegido. Tiene capa de mapa de calor nativa |
| PWA | **vite-plugin-pwa** | Instalación, service worker y, en v2, notificaciones |
| Contenedores | **Docker Compose** | Todo el sistema se levanta con un comando, igual en local y en el servidor |
| Servidor web | **Caddy** | Ya elegido. HTTPS automático |
| Servidor | **VPS Ubuntu Server en Azure** | Ya elegido. Para empezar alcanza con 2 vCPU y 4 GB de RAM |
| Dominio | **GoDaddy** | Ya elegido. Solo apunta al IP del VPS |

### Solo para la v2

| Necesidad | Tecnología |
|---|---|
| Tiempo real en el mapa | **Server-Sent Events** desde FastAPI + `LISTEN/NOTIFY` de PostgreSQL |
| Notificaciones | **Web Push** con claves VAPID (`pywebpush` en el servidor) |
| Imágenes de reportes | **Azure Blob Storage** ahora y **Amazon S3** en el futuro, detrás de una interfaz propia en `backend/almacenamiento/` |

### Experimento paralelo

| Necesidad | Tecnología |
|---|---|
| Almacén analítico | **Amazon Redshift Serverless** y **Microsoft Fabric Warehouse**, con una copia de los datos. Ver [[Almacén Analítico]] |

## Decisiones cerradas por esta recomendación

**«Posgrest» es PostgreSQL, no PostgREST.** PostgREST genera una API
automática, pero la v2 necesita lógica propia (votos, moderación, límites,
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

## Infraestructura

```
Internet ─► GoDaddy (DNS) ─► VPS Ubuntu (Azure)
                              └─ Docker Compose
                                  ├─ Caddy        (HTTPS, entrada única)
                                  ├─ frontend     (archivos estáticos de la PWA)
                                  ├─ backend      (FastAPI)
                                  ├─ martin       (teselas)
                                  ├─ postgres     (PostgreSQL + PostGIS)
                                  └─ ingesta      (tareas programadas)
```

- **Respaldo diario** de la base de datos con `pg_dump` a almacenamiento externo.
- **Tareas programadas:** v1 revisa CKAN a diario y carga solo si hay archivos
  nuevos; v2 consulta las noticias de la Policía cada pocos minutos.
- Los datos crudos descargados **no se versionan** (`codigo/data/raw/`).

## Primer paso técnico: esqueleto de punta a punta

Antes de construir funciones, levantar el camino completo con un solo
dataset: Docker Compose → PostGIS → ingesta de homicidios 2026 → Martin →
mapa en el navegador mostrando los puntos. Si ese camino funciona, el stack
queda probado y el resto es sumar capas y filtros.
