---
tags: [producto, hoja-de-ruta, versiones]
actualizado: 2026-10-09
---

# Hoja de Ruta

El sistema se construye por versiones. **Cada versión se publica y funciona
sola antes de empezar la siguiente**: la V1 tiene valor aunque la V2 nunca
llegue. Pero cada una se diseña para que la siguiente se sume sin rehacer
nada.

```
Fase 0 ──► V1 Observatorio Histórico ──► V2 Rutas e Inteligencia Horaria ──► V3 Tiempo Real y Comunidad ──► V4 Red Colaborativa e IA
(cimientos)
```

## Las versiones

| Versión | Qué resuelve | Documento |
|---|---|---|
| **Fase 0 + V1** | Mapa público con datos oficiales desde 2019, semáforo cantonal de extorsión/vacunas a negocios, estadísticas, metodología y licencia. **Publicada (2026-10-03)** en https://reporteec.playhubb.site; en cierre: faltan el worker diario y la prueba de la PWA en el teléfono | [[V1 - Mapa Histórico]] |
| **V2** | Navegación e inteligencia de riesgo en rutas por franja horaria (origen $\rightarrow$ destino), tramos críticos y API B2B de logística | [[V2 - Rutas e Inteligencia Horaria]] |
| **V3** | Reportes ciudadanos verificados, moderación, vista «Actualidad», notificaciones Web Push por zona y noticias de la Policía | [[V3 - Tiempo Real y Comunidad]] |
| **V4** | Canales de Telegram colaboradores, ingesta automatizada con IA, geocodificación y monitoreo de fuentes | [[V4 - Red Colaborativa e IA]] |
| **Negocio** | Modelo de sostenibilidad, API B2B para transporte y aseguradoras, y micro-suscripciones | [[Modelo de Monetización]] |

Cada documento de versión incluye qué trae, el orden de desarrollo, qué
evitar y **una lista para probarla uno mismo** antes de darla por terminada.

## Flujo de trabajo dentro de cada versión

1. **Rebanadas verticales:** cada función se construye de punta a punta (datos
   → backend → mapa) antes de pasar a la siguiente, en vez de hacer primero
   todo el backend y después todo el frontend. Así siempre hay algo que
   funciona y se puede mostrar.
2. **Probar con datos reales** desde el principio.
3. **Documentar al cerrar cada tarea:** si una decisión cambia, se actualiza
   este vault.
4. **Cerrar con la lista de pruebas manuales** de la versión.

## Futuro — sin fecha

- **App móvil nativa** con notificación por cercanía
- **Coordenadas de choques** (pendiente de conversar con la ANT o evaluar otra
  vía)
- **Fuente de robos** (por definir)
- Otros datasets del Ministerio del Interior: armas ilícitas, trata de
  personas, sustancias
- Migración de Azure a AWS, si la carga lo justifica

## Pendientes que atraviesan versiones

| Pendiente | Afecta a | Estado |
|---|---|---|
| **Límites de provincias y cantones** | Filtros, siniestros por cantón | **Resuelto:** geoBoundaries (CC BY 4.0) |
| **Límites de parroquias** | Ubicación de noticias | **Sin fuente todavía** (no se cargan) |
| Población por cantón (INEC) | Estadísticas de la V1 | **Resuelto:** cargada y usada en las tasas |
| Año de inicio de los siniestros del INEC | Año de inicio del mapa | **Resuelto:** 2019 (el archivo 2014–2020 cubre 2019 y 2020) |
| Licencia exacta de `datosabiertos.gob.ec` | Página de licencia de la V1 | **Revisado:** sin texto de licencia explícito; se cita bajo las condiciones generales del portal |
| Licencia del código de la plataforma | V1 | **Resuelto (2026-10-09):** GNU AGPL v3, archivo `LICENSE` en la raíz del repositorio |
| Worker diario en el VPS | V1 | **Bloqueado:** CKAN responde 403 al VPS; la actualización es manual con `codigo/scripts/actualizar_datos.sh` |
| Regla para fusionar duplicados | V3 | Por definir |
| Límite de reportes por hora y número de votos | V3 | Por definir |
| Quién modera y en qué horario | V3 | Por definir |
| Ciudad piloto de la V3 | V3 | Por definir |

Decisiones ya tomadas en [[Decisiones de Negocio Pendientes]]; tecnologías en
[[Stack e Infraestructura]]; estructura del código en [[Módulos del Sistema]].
