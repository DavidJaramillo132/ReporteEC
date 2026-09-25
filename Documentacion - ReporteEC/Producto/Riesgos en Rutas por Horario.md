---
tags: [producto, rutas, movilidad, inteligencia-horaria, seguridad-vial]
actualizado: 2026-09-24
---

# Riesgos en Rutas por Horario

> [!abstract] Objetivo del módulo
> Transformar los datos estáticos de criminalidad y siniestros en un **servicio de navegación con inteligencia de seguridad**.
> Permite a cualquier usuario o empresa consultar un trayecto (Origen $\rightarrow$ Destino) y conocer **qué tan peligroso es el recorrido en función de la hora del día**, señalando los tramos críticos y la mejor ventana horaria para viajar.

---

## 1. El Problema: El Riesgo no es Estático, es Horario

En Ecuador, la probabilidad de sufrir un asalto, secuestro exprés o interceptación armada en carretera depende críticamente del reloj:
* Un recorrido entre Guayaquil y Quevedo a las 10:00 AM presenta un perfil de riesgo moderado.
* El mismo recorrido a las 02:00 AM atraviesa corredores de altísima peligrosidad donde operan bandas de piratería terrestre.
* Los navegadores convencionales (Google Maps, Waze) optimizan por **tiempo de tráfico y distancia**, pero son ciegos al **riesgo delictivo histórico**.

ReporteEC no busca competir como navegador GPS giro a giro; busca ser la **capa de inteligencia de seguridad que evalúa la ruta**.

---

## 2. Metodología de Cálculo

```
 Punto A (Origen) ──────────────── Ruta (LineString) ────────────────► Punto B (Destino)
                                          │
                             ┌────────────┴────────────┐
                             ▼                         ▼
                  Buffer Urbano (200 m)     Buffer Carretera (1.000 m)
                             │                         │
                             └────────────┬────────────┘
                                          │
                        Intersección espacial con PostGIS
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
             Tipo y Gravedad del Delito            Franja Horaria del Hecho
          (Homicidio > Secuestro > Robo)         (00:00–06:00 > 19:00–24:00)
                                          │
                                          ▼
                         Índice de Riesgo del Trayecto (0 - 100)
                                          │
                     ┌────────────────────┼────────────────────┐
                     ▼                    ▼                    ▼
             Semáforo de Ruta      Tramos Críticos      Mejor Ventana Horaria
```

### Factores de Ponderación:

1. **Buffer de influencia espacial:**
   - En vías urbanas: Se proyecta un área de **200 metros** alrededor de la calle o avenida.
   - En carreteras y red vial estatal: Se proyecta un área de **1.000 metros** para capturar emboscadas y asaltos en bermas o gasolineras.
2. **Ponderación por tipo de delito:**
   - Secuestro y sicariato / homicidio: Peso máximo ($w = 1.0$).
   - Robo a vehículos / personas armado: Peso alto ($w = 0.7$).
   - Siniestro de tránsito grave: Peso preventivo ($w = 0.5$).
3. **Modulador horario (Franjas de 24 horas):**
   - **Madrugada (00:00 – 05:59):** Multiplicador $\times 1.6$ (menor tránsito, menor auxilio policial).
   - **Noche (19:00 – 23:59):** Multiplicador $\times 1.3$.
   - **Tarde (12:00 – 18:59):** Multiplicador $\times 1.0$.
   - **Mañana (06:00 – 11:59):** Multiplicador $\times 0.8$.
4. **Decaimiento temporal (Recencia):**
   - Los incidentes del año en curso tienen peso del 100%; los de años anteriores decaen exponencialmente para no penalizar vías que ya cuentan con puestos de control militar o policial fijos.

---

## 3. Salida para el Usuario (UI/UX)

Al ingresar una ruta, la interfaz presenta tres elementos concretos:

### A. Semáforo Global del Trayecto
* 🟢 **Ruta Segura (0–25 pts):** Baja concentración delictiva histórica en el horario seleccionado.
* 🟡 **Precaución (26–50 pts):** Registro de siniestros o robos menores esporádicos; transitable con atención.
* 🟠 **Riesgo Alto (51–75 pts):** Tramos recurrentes de asaltos o balaceras nocturnas; se sugiere no viajar de noche.
* 🔴 **Riesgo Crítico (>75 pts):** Corredor con antecedentes frecuentes de secuestro, piratería de carretera o extorsión armada.

### B. Gráfico de Curva Horaria
Un gráfico interactivo de 24 horas que responde a la pregunta:
> *«¿A qué hora me conviene salir?»*
Muestra los picos de peligro (ej. un pico pronunciado a partir de las 20:00) y recomienda la ventana óptima de traslado.

### C. Alertas de «Tramos Negros» (*Blackspots*)
Tarjetas descriptivas sobre puntos específicos del mapa:
> ⚠️ **Km 42 Vía Santo Domingo–Quevedo:** *8 asaltos a transporte pesado y 2 tiroteos registrados entre 21:00 y 04:00 en los últimos 6 meses.*

---

## 4. Oportunidad Estratégica y Monetización

Este módulo es la piedra angular del modelo de negocio B2B de ReporteEC:
1. **API para Logística y Carga:** Las flotas de transporte pesado pueden consultar la API para planificar despachos y calcular primas de riesgo de choferes.
2. **Integración con Empresas de Rastreo Satelital (GPS):** Plataformas que rastrean flotas en Ecuador pueden integrar el semáforo de riesgo de ReporteEC en su panel de monitoreo.
3. **Versión Ciudadana (Freemium):** En la web pública se permite consultar rutas de forma gratuita. En la versión Pro móvil, el usuario recibe alertas preventivas antes de tomar una ruta habitual.

Detalle del modelo comercial en [[Modelo de Monetización]].
