---
tags: [producto, rutas, movilidad, inteligencia-horaria, seguridad-vial]
actualizado: 2026-10-10
---

# Riesgos en Rutas por Horario

> [!abstract] Objetivo del módulo
> Transformar los datos oficiales de muertes violentas en un **servicio de navegación con inteligencia de seguridad**.
> Permite a cualquier usuario o empresa consultar un trayecto (Origen $\rightarrow$ Destino) y conocer **qué tan peligroso es el recorrido en función de la hora del día**, señalando los tramos críticos y la mejor ventana horaria para viajar.

---

## 1. El Problema: El Riesgo no es Estático, es Horario

En Ecuador, las muertes violentas registradas dependen del reloj: se concentran entre las 19:00 y las 23:00 y son mínimas entre las 03:00 y las 05:00. Por eso una misma ruta puede tener un puntaje distinto según la hora de salida.

El puntaje mide el **peligro por kilómetro**, no el total del viaje: una ruta larga no sale peor solo por ser larga. El total de casos cerca de la ruta se muestra aparte.
* Los navegadores convencionales (Google Maps, Waze) optimizan por **tiempo de tráfico y distancia**, pero son ciegos al **riesgo delictivo histórico**.

ReporteEC no busca competir como navegador GPS giro a giro; busca ser la **capa de inteligencia de seguridad que evalúa la ruta**.

---

## 2. Metodología de Cálculo

```
 Punto A (Origen) ── OSRM (ruta en auto) ──► Punto B (Destino)
                          │
          Ruta cortada en tramos de 1 km
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
 Tramo a 60 km/h o más               Tramo más lento
 Buffer de 1.000 m                   Buffer de 200 m
        └─────────────────┬─────────────────┘
                          │
   Casos cercanos (PostGIS), con peso por recencia
                          │
   Curva de 24 horas: hora real de los casos, suavizada
   y apoyada en la curva nacional
                          │
   Casos por km × peso de las horas del viaje  ──►  Percentil 0 - 100
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
 Semáforo de Ruta   Tramos Críticos   Mejor hora de salida
```

### Cómo se calcula:

1. **Qué casos cuentan:** homicidios, sicariatos y femicidios que se dibujan en el mapa (ubicación exacta o aproximada; los de nivel cantón no cuentan). La hora se toma en hora local de Ecuador. Los casos sin hora registrada (guardados a las 00:00:00) no forman la curva horaria, pero sí cuentan en el total.
2. **Buffer de influencia espacial:** la ruta se corta en tramos de 1 km. Un tramo con velocidad media de 60 km/h o más usa **1.000 metros**; los demás, **200 metros**.
3. **Recencia:** peso $w_i = 0{,}5^{\,edad_i/365{,}25}$, con la edad (en días) medida desde la fecha de corte de los datos (un caso de hace un año pesa la mitad).
4. **Curva horaria:** $raw[h]$ es la suma de $w_i$ de los casos de la ruta con hora registrada que ocurrieron a la hora local $h$ (0 a 23); los casos sin hora no entran aquí (en el código, `weighted_by_hour`). Se suaviza de forma circular: $suave[h] = 0{,}25\,raw[h-1] + 0{,}5\,raw[h] + 0{,}25\,raw[h+1]$. Se acerca a la curva nacional según $share[h] = (suave[h] + K \cdot nac[h]) / (\sum_h raw[h] + K)$, con $K = 20$.
5. **Casos por km:** $W / km$, donde $W$ es la suma de $w_i$ de **todos** los casos de la ruta (con o sin hora) y $km$ la distancia de OSRM. Es igual a cualquier hora y se muestra junto al total de casos. En rutas de menos de 10 km se divide entre 10 km, para que un solo caso no dispare el puntaje (solo para el puntaje; la cifra que se muestra usa la distancia real).
6. **Valor por hora de salida (densidad):** $densidad(H) = (W / \max(km, 10)) \times 24 \times m(H)$. $m(H)$ es el promedio de $share$ sobre las horas que dura el viaje (duración de OSRM), empezando en $H$: cada hora pesa según los minutos que el viaje pasa en ella, y pasada la medianoche sigue en las 00:00. Un viaje de menos de una hora usa solo $share[H]$. Con una curva pareja ($share = 1/24$), $24 \times m(H) = 1$ y, en rutas de 10 km o más, la densidad es igual a los casos por km. El largo por sí solo no la sube: el doble de casos en el doble de kilómetros da la misma densidad, con la misma distribución horaria y el mismo horario de viaje. Sin casos cerca, densidad 0 y puntaje 0.
7. **Puntaje 0 a 100:** percentil de esa densidad frente a las densidades agrupadas de unas 800 a 1.000 rutas de referencia entre cantones del continente, a las 24 horas de salida (cada cantón con sus 5 más cercanos, más 200 pares de 100 km o más). La escala se guarda con su métrica (`density_per_km`); las escalas viejas, de exposición total, no se usan. Se recalcula tras cada actualización de datos. Franjas: 0–25 Seguro, 26–50 Precaución, 51–75 Riesgo alto, más de 75 Crítico.
8. **Mejor hora:** la de menor densidad (como los casos por km no cambian con la hora, es la de menor $m(H)$); con empates dentro de 5 %, la más temprana. Sin casos, no hay mejor hora.
9. **Errores:** si el origen o el destino queda a más de 2 km de una vía, la ruta no se calcula.

> [!example] Ejemplo con números redondos
> Una ruta de 100 km con $W = 20$ tiene 0,2 casos por km. Saliendo a las 22:00, un viaje de 90 minutos pasa una hora en las 22:00 y media hora en las 23:00. Si $share[22] = 6\,\%$ y $share[23] = 5\,\%$: $m(22) = (0{,}06 + 0{,}5 \times 0{,}05) / 1{,}5 \approx 0{,}0567$, y $densidad = 0{,}2 \times 24 \times 0{,}0567 \approx 0{,}27$. Si 0,27 supera al 70 % de las densidades de referencia, el puntaje es 70 («Riesgo alto»).

> [!note] Por qué cambió (2026-10-10)
> La primera versión del puntaje usaba la exposición total del viaje ($W$ por la suma de la curva en las horas del viaje). Con datos reales, esa cifra crecía con el largo de la ruta: 15 de 22 rutas entre cantones salían «Crítico». Ahora el puntaje mide peligro por kilómetro y el total de casos se muestra aparte.

> [!warning] Lo que el puntaje no es
> Mide muertes violentas registradas por kilómetro de la ruta, no todo el delito ni el riesgo de cada persona. No se ajusta por tráfico: de noche viaja menos gente. Robos, secuestros y siniestros quedan fuera por falta de datos con ubicación.

### Descartado: multiplicadores fijos y pesos por tipo

El borrador inicial usaba multiplicadores por franja (madrugada $\times 1{,}6$, noche $\times 1{,}3$, tarde $\times 1{,}0$, mañana $\times 0{,}8$) y pesos por tipo de delito (robo $0{,}7$, siniestro $0{,}5$). Se descartaron porque los datos los contradicen: las muertes violentas del país se concentran entre las 19:00 y las 23:00 (de 2.400 a 3.000 casos en total desde 2019 por cada hora del día) y son mínimas entre las 03:00 y las 05:00 (de 790 a 1.200 en total desde 2019), lo contrario de «madrugada crítica». Además no hay datos con ubicación de robos ni secuestros, y los siniestros solo llegan por cantón. Ahora la curva sale de la hora real de los casos.

---

## 3. Salida para el Usuario (UI/UX)

Al ingresar una ruta, la interfaz presenta tres elementos concretos:

### A. Semáforo Global del Trayecto
* 🟢 **Seguro (0–25 pts):** pocas muertes violentas registradas por kilómetro en el horario seleccionado, frente a las rutas de referencia.
* 🟡 **Precaución (26–50 pts):** densidad moderada; transitable con atención.
* 🟠 **Riesgo alto (51–75 pts):** densidad alta; conviene revisar la mejor hora de salida.
* 🔴 **Crítico (>75 pts):** de las rutas con más muertes violentas registradas por kilómetro; conviene evitar esa hora si se puede.

Junto al semáforo se muestran el total de casos cerca de la ruta y los casos por km.

El semáforo siempre lleva su texto y su forma, nunca solo el color.

### B. Gráfico de Curva Horaria
Un gráfico interactivo de 24 horas que responde a la pregunta:
> *«¿A qué hora me conviene salir?»*
Muestra el puntaje de cada hora de salida y señala la mejor hora, si la ruta tiene casos cerca.

### C. Alertas de «Tramos Negros» (*Blackspots*)
Tarjetas descriptivas sobre puntos específicos del mapa:
> ⚠️ **Km 42–43 de la ruta:** *casos registrados por tipo, las 3 horas pico y el rango de fechas.* Hasta 5 por ruta.

---

## 4. Oportunidad Estratégica y Monetización

Este módulo es la base de la futura línea B2B de ReporteEC. Las claves de API se harán **después de la V2** (ver [[V2 - Rutas e Inteligencia Horaria]]):
1. **API para Logística y Carga:** Las flotas de transporte pesado pueden consultar la API para planificar despachos y calcular primas de riesgo de choferes.
2. **Integración con Empresas de Rastreo Satelital (GPS):** Plataformas que rastrean flotas en Ecuador pueden integrar el semáforo de riesgo de ReporteEC en su panel de monitoreo.
3. **Versión Ciudadana (Freemium):** En la web pública se permite consultar rutas de forma gratuita. En la versión Pro móvil, el usuario recibe alertas preventivas antes de tomar una ruta habitual.

Detalle del modelo comercial en [[Modelo de Monetización]].
