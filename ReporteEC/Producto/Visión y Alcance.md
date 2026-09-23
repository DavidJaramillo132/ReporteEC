---
tags: [producto, alcance]
actualizado: 2026-09-22
---

# Visión y Alcance

## El problema

En Ecuador la información sobre incidentes de seguridad está fragmentada entre
boletines institucionales, notas de prensa y rumores en redes sociales. Existen
mapas y recuentos, pero ninguno responde a la pregunta que de verdad importa:
**¿de dónde salió este dato y cuánto me puedo fiar de él?**

## La propuesta

Un mapa de incidentes donde cada registro declara su procedencia y su grado de
verificación mediante [[Niveles de Confianza]]. La trazabilidad no es un adorno
de la interfaz: es el producto, y además es lo que protege legalmente al
proyecto frente a la publicación de información no confirmada.

## Alcance propuesto para la v1

Recorte deliberado para llegar a algo publicable y defendible:

- Mapa con datos oficiales históricos ([[Fuentes]])
- Filtros por año, provincia, cantón, tipo y mes
- Sección de estadísticas dividida por categoría
- Etiquetas de confianza y fuente visibles en cada incidente

Esto ya constituye un producto útil y concentra el diferenciador completo con
una fracción del riesgo.

## Postergado a versiones posteriores

| Funcionalidad | Motivo |
|---|---|
| Reportes ciudadanos | Exige moderación resuelta antes de abrir ([[Riesgos Abiertos]]) |
| Tiempo casi real | Depende de scraping frágil, no de las fuentes oficiales |
| Notificación por cercanía | Técnicamente imposible en PWA ([[Riesgos Abiertos]]) |
| App móvil nativa | Solo si el producto valida tracción |

## Funcionalidades descritas en la idea original

Recogidas de [[Ideas Sueltas]] y pendientes de ubicar en una versión:

- Selector entre histórico (últimos 4 años) y actualidad
- Notificación flotante en el lateral inferior derecho al registrarse un
  incidente nuevo, con formato `🟡 Accidente · Portoviejo · Hace 25 min · Fuente: …`
- Reportes ciudadanos anónimos desde móvil, con ubicación automática,
  descripción breve y foto opcional
- Optimización de subida de imágenes hacia un bucket
