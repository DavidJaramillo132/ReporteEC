---
tags: [producto, riesgos, decisiones]
actualizado: 2026-09-22
---

# Riesgos Abiertos

Ordenados por capacidad de matar el proyecto, no por dificultad técnica.

> [!info] Documento hermano
> Aquí se recogen **amenazas a la viabilidad**. Las incoherencias de la lógica
> del producto viven en [[Decisiones de Negocio Pendientes]].

## 1. Reportes ciudadanos sin moderación

> [!info] Mitigado parcialmente el 2026-09-22 — reportar exige cuenta registrada y verificada. La cola de moderación sigue siendo necesaria.

**El riesgo más grave, y el único que la idea original no menciona.**

Anónimo + sin cuenta + geolocalizado + categorías como «robos» o «disparos» es
un sistema trivial de envenenar. Basta con que alguien reporte un asalto falso
frente a un negocio que le disgusta para que la plataforma se convierta en
instrumento de difamación, con responsabilidad sobre quien la opera.

Mínimos antes de abrir esta funcionalidad:

- Cola de moderación previa a la publicación
- Límite de frecuencia por dispositivo
- Nacimiento obligatorio en 🟠 En revisión, sin ascenso automático
  ([[Niveles de Confianza]])

Riesgo adicional a considerar: cartografiar delito por ubicación tiene efectos
reales sobre estigmatización de barrios y valor inmobiliario.

## 2. El «tiempo casi real» no procede de las fuentes oficiales

> [!check] Decidido el 2026-09-22 — se mantiene el tiempo real, asumiendo que su confianza máxima es 🟡 / 🟠. Ver [[Decisiones de Negocio Pendientes]].

Verificado: los datasets del Ministerio del Interior se actualizan
**mensualmente** y con rezago aproximado de un mes ([[Fuentes]]). La única vía
hacia el tiempo casi real es scrapear `noticias.policia.gob.ec`, lo cual es:

- Frágil — un cambio de maquetación deja la ingesta ciega
- De legalidad ambigua respecto a los términos del sitio

**Decisión pendiente:** o se asume que el realtime depende de un scraper y se
comunica con honestidad, o se retira la promesa del producto.

## 3. La notificación por cercanía no es viable en PWA

> [!check] Decidido el 2026-09-22 — se posterga a la app nativa; la PWA usa suscripción por zona. Ver [[Decisiones de Negocio Pendientes]], punto 12.

Restricción técnica, no opinión:

- La web **no dispone de geofencing en segundo plano**. La Geolocation API
  exige la página activa y en primer plano.
- En iOS, Web Push existe desde 16.4 y **solo** si el usuario instaló la PWA
  en su pantalla de inicio.

«Si hubo un incidente cerca de tu ubicación, se te notificará» es precisamente
la funcionalidad que obliga a app nativa.

**Decisión pendiente:** degradarla a «notificación al abrir la app», o asumir
desarrollo nativo desde el inicio.

## 4. El alcance equivale a tres proyectos

Pipeline ETL + plataforma geoespacial + PWA con reportes y notificaciones.
Cada bloque son meses de trabajo. Abordarlos en paralelo es la vía más segura
a no terminar ninguno. Ver el recorte propuesto en [[Visión y Alcance]].

## 5. Ambigüedad en el stack de base de datos

> [!check] Resuelto el 2026-09-22 — PostgreSQL + FastAPI, no PostgREST. Stack aprobado. Ver [[Stack e Infraestructura]].

La nota original menciona «Posgrest». Son dos cosas distintas:

- **PostgreSQL** — el motor de base de datos
- **PostgREST** — herramienta que genera una API REST automática sobre PostgreSQL

La elección cambia si hay backend propio o no. Ver [[Stack e Infraestructura]].

## 6. Estructura de carpetas del repositorio

> [!check] Resuelto el 2026-09-22 — carpetas separadas para ingesta, backend, frontend y despliegue. Ver [[Módulos del Sistema]].

`Documentacion - ReporteEC/` (documentación) y `codigo/` (implementación) conviven como
carpetas hermanas. Falta definir la estructura interna de `codigo/` antes de
escribir la primera línea.
