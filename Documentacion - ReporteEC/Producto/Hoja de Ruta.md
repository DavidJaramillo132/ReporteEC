---
tags: [producto, hoja-de-ruta, versiones]
actualizado: 2026-09-23
---

# Hoja de Ruta

El sistema se construye por versiones. **Cada versión se publica y funciona
sola antes de empezar la siguiente**: la V1 tiene valor aunque la V2 nunca
llegue. Pero cada una se diseña para que la siguiente se sume sin rehacer
nada.

```
Fase 0 ──► V1 Mapa histórico ──► V2 Tiempo real ──► V3 Fuentes colaboradoras + IA ──► Futuro
(cimientos)                  └─► Experimento analítico (en paralelo)
```

## Las versiones

| Versión | Qué resuelve | Documento |
|---|---|---|
| **Fase 0 + V1** | Mapa público con todos los datos oficiales desde 2019, estadísticas, metodología, licencia y página de inicio | [[V1 - Mapa Histórico]] |
| **V2** | Reportes ciudadanos, cuentas verificadas por correo, moderación, vista «Actualidad», notificaciones por zona y noticias de la Policía | [[V2 - Tiempo Real]] |
| **V3** | Canales y grupos de Telegram que colaboran, procesados con IA y geocodificación | [[V3 - Fuentes Colaboradoras e IA]] |
| **Experimento** | Comparar Amazon Redshift con Microsoft Fabric Warehouse sobre una copia de los datos | [[Almacén Analítico]] |

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
| **Límites de provincias, cantones y parroquias** | Filtros, siniestros por cantón, ubicación de noticias | **Sin fuente todavía** |
| Población por cantón (INEC) | Estadísticas de la V1 | Por verificar |
| Año de inicio de los siniestros del INEC | Año de inicio del mapa | Por verificar |
| Licencia exacta de `datosabiertos.gob.ec` | Página de licencia de la V1 | Por revisar |
| Regla para fusionar duplicados | V2 | Por definir |
| Límite de reportes por hora y número de votos | V2 | Por definir |
| Quién modera y en qué horario | V2 | Por definir |
| Ciudad piloto de la V2 | V2 | Por definir |

Decisiones ya tomadas en [[Decisiones de Negocio Pendientes]]; tecnologías en
[[Stack e Infraestructura]]; estructura del código en [[Módulos del Sistema]].
