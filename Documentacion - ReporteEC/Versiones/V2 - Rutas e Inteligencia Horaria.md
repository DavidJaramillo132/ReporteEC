---
tags: [version, v2, rutas, movilidad, inteligencia-horaria]
actualizado: 2026-10-09
estado: en desarrollo
---

# V2 — Rutas Seguras e Inteligencia Horaria

> [!abstract] Objetivo de la versión
> Transformar la base de datos histórica nacional de la [[V1 - Mapa Histórico]] en un **servicio de evaluación de riesgo en trayectos según la hora de salida**.
> No requiere moderación de usuarios ni cuentas: opera 100% sobre los datos oficiales ya consolidados. Las claves de API para empresas (B2B) quedan para después de la V2.

Detalle de metodología en [[Riesgos en Rutas por Horario]] y modelo de negocio en [[Modelo de Monetización]].

> [!info] Estado (2026-10-09)
> Construida en la rama `feat/v2-rutas`: backend (módulo `routing`, OSRM, escala de referencia) y la página `/rutas`, más la sección «Riesgo en rutas» de la Metodología pública. Falta la revisión final, publicarla y recorrer la lista de la sección 4 en producción.

---

## 1. Qué trae la V2

### A. Consulta de Trayectos (Origen $\rightarrow$ Destino)
* Origen y destino con un clic sobre el mapa, o escribiendo el nombre de un cantón y eligiéndolo de la lista (los 221 cantones). Sin geocodificador externo.
* Trazado de la ruta en auto con **OSRM**, un servidor de rutas propio que usa el mapa abierto de OpenStreetMap para Ecuador.
* **Buffer espacial automático:** se decide por cada kilómetro de la ruta según su velocidad media: 1.000 metros si es de 60 km/h o más (carretera), 200 metros en los demás (ciudad).

### B. Evaluación del Nivel de Peligro por Horario
* **Puntuación del trayecto (0 a 100):** es un percentil frente a unas 800 a 1.000 rutas de referencia entre cantones, y se muestra como semáforo con texto (Seguro, Precaución, Riesgo alto, Crítico).
* **Curva de riesgo en 24 horas:** la forma de la curva sale de la hora real de los casos cercanos a la ruta, suavizada y apoyada en la curva nacional cuando hay pocos casos. No usa multiplicadores fijos.
* **Recomendación:** la mejor hora de salida (la de menor exposición; si varias empatan dentro de 5 %, la más temprana). Una ruta sin casos cerca no tiene mejor hora.

### C. Detección de Tramos Críticos (*Blackspots*)
* Un tramo es un kilómetro de la ruta con al menos 3 de peso entre los casos cercanos y dentro del 10 % más cargado de la ruta; hasta 5 por ruta.
* Cada tramo muestra el rango de kilómetros, los casos por tipo, las 3 horas pico y el rango de fechas.
* Solo cuentan homicidios, sicariatos y femicidios con ubicación exacta o aproximada. Robos, secuestros y siniestros no entran: no hay datos con ubicación.

### D. API pública documentada
* `GET /api/routes/risk` (origen, destino y hora de salida) y `GET /api/places/search` (cantones), documentados en OpenAPI.
* Las claves de API, cuotas y uso para empresas **no** van en la V2: llegan después de la V2 (ver [[Modelo de Monetización]]).

---

## 2. Orden de Desarrollo

Lo que se construyó, en el orden en que se hizo:

| # | Tarea | Resultado |
|---|---|---|
| 1 | Servidor de rutas propio | OSRM con el mapa de Ecuador de OpenStreetMap, preparado en la máquina del desarrollador y subido al servidor (en lugar de importar ejes viales de MTOP o pgRouting) |
| 2 | Cruce espacial y curva horaria | Módulo `routing` del backend: casos cercanos a la ruta, peso por recencia (vida media de 12 meses) y curva de 24 horas |
| 3 | Escala de referencia | Trabajo `route-reference`: exposición de unas 800 a 1.000 rutas entre cantones a las 24 horas, guardada como percentiles |
| 4 | Endpoint de riesgo en FastAPI | `GET /api/routes/risk` con caché en memoria y buscador de cantones |
| 5 | Interfaz en el frontend | Página `/rutas`: selector de origen y destino, semáforo, curva de 24 horas y lista de tramos críticos |
| 6 | Metodología pública y vault | Sección «Riesgo en rutas» en `/metodologia` y esta documentación |

Después de la V2: documentación y claves de API para clientes B2B.

---

## 3. Qué Evitar en la V2

- **No intentar competir como navegador GPS giro a giro con voz.** ReporteEC no es Waze ni Google Maps; su valor es el **diagnóstico de seguridad del recorrido**.
- **No mezclar reportes de usuarios todavía.** Esta versión se nutre únicamente de los datos oficiales validados en la V1 para garantizar rigor matemático y cero costes de moderación.
- **No sobrecargar la base de datos con rutas complejas.** Se guardan en memoria las últimas rutas consultadas.
- **No presentar el puntaje como riesgo personal.** Mide muertes violentas registradas cerca de la ruta; no se ajusta por la cantidad de tráfico.

---

## 4. Cómo Probarla Tú Mismo

Lista de verificación manual antes de dar la V2 por cerrada:

- [ ] Ingresar una ruta conocida (ej. Guayaquil $\rightarrow$ Babahoyo) dibuja el trazado correcto en el mapa.
- [ ] Cambiar la hora de viaje de 10:00 AM a 02:00 AM cambia el puntaje del semáforo.
- [ ] Los incidentes detectados en el trayecto corresponden a los ocurridos dentro del buffer de la carretera.
- [ ] El gráfico de curva de 24 horas muestra la variación del riesgo a lo largo del día.
- [ ] La API responde en menos de 300 ms (p95) para consultas de ruta entre 20 pares de cantones.
- [ ] No hay errores en la consola del navegador y la página se ve bien a 390 px.
- [ ] Los demás sitios del servidor compartido siguen respondiendo y la memoria del servidor es suficiente tras el arranque.

## Terminada cuando
Todas las casillas anteriores están verificadas en producción. La API para empresas llega después de la V2.
