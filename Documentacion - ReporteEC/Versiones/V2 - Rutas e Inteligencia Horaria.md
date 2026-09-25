---
tags: [version, v2, rutas, movilidad, inteligencia-horaria, monetizacion]
actualizado: 2026-09-24
estado: pendiente de la V1
---

# V2 — Rutas Seguras e Inteligencia Horaria

> [!abstract] Objetivo de la versión
> Transformar la base de datos histórica nacional de la [[V1 - Mapa Histórico]] en un **servicio de navegación y evaluación de riesgo en trayectos según la hora**.
> No requiere moderación de usuarios ni cuentas: opera 100% sobre los datos oficiales ya consolidados y habilita la **primera línea de monetización B2B** para transporte y logística.

Detalle de metodología en [[Riesgos en Rutas por Horario]] y modelo de negocio en [[Modelo de Monetización]].

---

## 1. Qué trae la V2

### A. Consulta de Trayectos (Origen $\rightarrow$ Destino)
* Selector de punto de partida y llegada sobre el mapa o mediante buscador geocodificado.
* Trazado de la ruta vial más rápida utilizando la red vial oficial del Ecuador.
* **Buffer espacial automático:** Proyección de influencia de 200 metros en avenidas urbanas y 1.000 metros en carreteras estatales.

### B. Evaluación del Nivel de Peligro por Horario
* **Puntuación del trayecto (0 a 100):** Semáforo cualitativo (🟢 Seguro, 🟡 Precaución, 🟠 Riesgo Alto, 🔴 Crítico).
* **Curva de Riesgo en 24 Horas:** Gráfico interactivo que muestra cómo varía la peligrosidad del recorrido a lo largo del día:
  - Madrugada (00:00 – 06:00): Ponderación crítica ($\times 1.6$).
  - Noche (19:00 – 24:00): Ponderación alta ($\times 1.3$).
  - Horario diurno: Riesgo base.
* **Recomendación inteligente:** Ventana horaria óptima para iniciar el viaje con menor exposición al delito.

### C. Detección de Tramos Críticos (*Blackspots*)
* Detección visual de segmentos de vía con alta densidad histórica de:
  - Piratería de carretera y asaltos a transporte.
  - Siniestros de tránsito graves.
  - Hechos de violencia armada.
* Ficha de detalle de cada tramo crítico con advertencias preventivas.

### D. API REST B2B para Empresas
* Endpoints para consultas masivas de flotas (`/api/v1/routes/risk-assessment`).
* Integración con plataformas de rastreo satelital GPS (Hunter, CarSync, Tracklink) y empresas de logística.

---

## 2. Orden de Desarrollo

| # | Tarea | Justificación técnica |
|---|---|---|
| 1 | Geometría de la red vial nacional | Importar ejes viales de MTOP / OpenStreetMap en PostGIS |
| 2 | Algoritmo de buffer y cruce espacial | Función SQL en PostGIS que intersecta el buffer de la ruta con la tabla `incidents` |
| 3 | Modulador de ponderación horaria | Cálculo matemático del índice de riesgo según franja horaria |
| 4 | Endpoint de cálculo de ruta en FastAPI | Controlador que recibe coordenadas origen/destino y devuelve el score |
| 5 | Interfaz de usuario en el frontend | Selector de ruta, semáforo, gráfico de curva 24h y lista de tramos críticos |
| 6 | Documentación de la API para clientes B2B | Especificación OpenAPI para empresas de logística y transporte |

---

## 3. Qué Evitar en la V2

- **No intentar competir como navegador GPS giro a giro con voz.** ReporteEC no es Waze ni Google Maps; su valor es el **diagnóstico de seguridad del recorrido**.
- **No mezclar reportes de usuarios todavía.** Esta versión se nutre únicamente de los datos oficiales validados en la V1 para garantizar rigor matemático y cero costes de moderación.
- **No sobrecargar la base de datos con rutas complejas.** Cachear los tramos intercantonales más consultados (ej. Quito–Guayaquil, Guayaquil–Salinas, Santo Domingo–Quevedo).

---

## 4. Cómo Probarla Tú Mismo

Lista de verificación manual antes de dar la V2 por cerrada:

- [ ] Ingresar una ruta conocida (ej. Guayaquil $\rightarrow$ Babahoyo) dibuja el trazado correcto en el mapa.
- [ ] Cambiar la hora de viaje de 10:00 AM a 02:00 AM incrementa el índice de riesgo y cambia el color del semáforo.
- [ ] Los incidentes detectados en el trayecto corresponden a los ocurridos dentro del buffer de la carretera.
- [ ] El gráfico de curva de 24 horas refleja claramente los picos de mayor peligrosidad nocturna.
- [ ] La API responde en menos de 300 ms para cualquier consulta de ruta entre dos cantones.
- [ ] Una empresa de logística puede autenticarse con API Key y recibir el JSON de evaluación.

## Terminada cuando
Todas las casillas anteriores están verificadas y al menos un cliente de transporte prueba la API piloto.
