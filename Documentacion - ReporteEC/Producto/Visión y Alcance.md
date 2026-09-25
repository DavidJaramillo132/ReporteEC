---
tags: [producto, alcance]
actualizado: 2026-09-24
---

# Visión y Alcance

## El problema

En Ecuador la información sobre incidentes de seguridad y criminalidad está fragmentada entre
boletines institucionales, notas de prensa y rumores en redes sociales. Existen
mapas y recuentos, pero ninguno responde a las preguntas operativas que de verdad importan:
1. **¿De dónde salió este dato y cuánto me puedo fiar de él?**
2. **¿Qué tan peligroso es transitar por una ruta según la hora del día?**
3. **¿Cuál es el riesgo real de abrir o mantener un negocio frente a extorsiones y vacunas en un cantón o parroquia?**

## La propuesta

ReporteEC evoluciona de un simple visor a una **plataforma integral de inteligencia geoespacial y movilidad segura**:
- **Trazabilidad y Niveles de Confianza:** Cada registro declara su procedencia y grado de verificación ([[Niveles de Confianza]]), blindando al proyecto ética y legalmente.
- **Inteligencia de Rutas por Horario:** Evaluación de trayectos (origen $\rightarrow$ destino) identificando tramos de alta incidencia según la hora ([[Riesgos en Rutas por Horario]]).
- **Índice de Riesgo Comercial:** Mapeo del impacto delictivo y extorsivo por sector territorial para negocios e inversiones ([[Extorsión y Vacunas a Negocios]]).
- **Modelo de Sostenibilidad:** Plataforma pública para la ciudadanía combinada con servicios B2B para logística, flotas de transporte y aseguradoras ([[Modelo de Monetización]]).

## Versiones

El contenido de cada versión está en [[Hoja de Ruta]]:

- **v1 — Observatorio Histórico y Riesgo Comercial:** datos oficiales desde 2019, semáforo cantonal de extorsión y estadísticas normalizadas por población.
- **v2 — Rutas Seguras e Inteligencia Horaria:** navegación y evaluación de riesgo en trayectos viales con modulación por franja horaria y API B2B.
- **v3 — Tiempo Real y Comunidad:** reportes ciudadanos moderados, PWA con avisos zonales y noticias policiales.
- **v4 — Red Colaborativa e IA:** canales de Telegram aliados, extracción con IA y geocodificación automática.

## Funcionalidades descritas en la idea original

Recogidas de [[Ideas Sueltas]] y pendientes de ubicar en una versión:

- Selector entre histórico (últimos 4 años) y actualidad
- Notificación flotante en el lateral inferior derecho al registrarse un
  incidente nuevo, con formato `🟡 Accidente · Portoviejo · Hace 25 min · Fuente: …`
- Reportes ciudadanos anónimos desde móvil, con ubicación automática,
  descripción breve y foto opcional
- Optimización de subida de imágenes hacia un bucket
