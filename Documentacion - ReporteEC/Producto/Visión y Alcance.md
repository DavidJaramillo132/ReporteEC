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

## Versiones

El contenido de cada versión está en [[Hoja de Ruta]]:

- **v1 — Mapa histórico:** todos los datos oficiales desde 2019, preparado
  para la v2.
- **v2 — Tiempo real:** noticias de la Policía, reportes ciudadanos y
  notificaciones.
- **Futuro:** app nativa, coordenadas de choques, fuente de robos.

## Funcionalidades descritas en la idea original

Recogidas de [[Ideas Sueltas]] y pendientes de ubicar en una versión:

- Selector entre histórico (últimos 4 años) y actualidad
- Notificación flotante en el lateral inferior derecho al registrarse un
  incidente nuevo, con formato `🟡 Accidente · Portoviejo · Hace 25 min · Fuente: …`
- Reportes ciudadanos anónimos desde móvil, con ubicación automática,
  descripción breve y foto opcional
- Optimización de subida de imágenes hacia un bucket
