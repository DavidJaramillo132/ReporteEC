---
tags: [datos, extorsion, vacunas, negocios, fge, oeco, riesgo-comercial]
actualizado: 2026-09-24
---

# Extorsión y «Vacunas» a Negocios

> [!important] Relevancia para el producto
> La extorsión, conocida popularmente en Ecuador como **«vacuna»**, se ha convertido en la mayor amenaza operativa para comerciantes, transportistas y emprendedores.
> Incorporar este delito permite construir el **Índice de Riesgo Comercial** por cantón, fundamental para la toma de decisiones económicas y el modelo de monetización B2B.

---

## 1. Fuentes Identificadas en Ecuador

A diferencia de los homicidios (que tienen coordenadas exactas de levantamiento de cadáveres), la extorsión se denuncia en unidades judiciales o policiales y suele reportarse agregada a nivel cantonal o provincial por protección a las víctimas.

| Fuente | Tipo de Registro | Nivel de Detalle | Cobertura Temporal |
|---|---|---|---|
| **Fiscalía General del Estado (FGE)** | Denuncias formales («Noticias del delito» - Art. 185 COIP) | Provincia, cantón, fecha y tipología | 2019 – 2026 |
| **Observatorio Ecuatoriano de Crimen Organizado (OECO / PADF)** | Sistematización analítica y tasas normalizadas | Provincia y cantones priorizados | 2019 – 2025 |
| **Policía Nacional (UNASE / FICE)** | Detenciones y operativos antiextorsión | Punto aproximado o cantón | 2019 – 2026 |
| **Directorio de Empresas (DIEE - INEC)** | Catastro de locales y unidades económicas | Cantón y parroquia | Anual |

---

> [!success] Fuente descargable verificada (2026-09-25)
> CSV del OECO «Noticias del Delito» (FGE), conteo mensual por cantón,
> 2019–2025. Detalle en [[Fuentes]].

## 2. Comportamiento Estadístico del Fenómeno

* **Crecimiento exponencial:** Según datos consolidados por OECO a partir de la FGE, las noticias del delito por extorsión pasaron de **1.616 en 2019 a más de 16.130 en 2025**, lo que representa un incremento del **898%**.
* **Distribución geográfica (Focos de concentración):**
  - **Guayas:** Concentra aproximadamente el **35%** de las denuncias a nivel nacional (Guayaquil, Durán, Daule).
  - **Pichincha:** Registra cerca del **13%** (Quito: distritos Eloy Alfaro, Quitumbe, Calderón).
  - **El Oro:** **10%** (Machala, Pasaje, Huaquillas).
  - **Esmeraldas:** **7%**.
  - **Manabí:** **6%** (Manta, Portoviejo).
* **El factor subregistro («Cifra negra»):** Informes del OECO y gremios de comerciantes estiman que **hasta un 70% de las extorsiones no se denuncian formalmente** por desconfianza en el sistema judicial y temor a represalias de grupos de delincuencia organizada (GDO).

---

## 3. Metodología: Índice de Riesgo Comercial

Para no limitarse al conteo crudo de denuncias (que castiga a ciudades más grandes), el sistema calcula el **Índice de Riesgo Comercial (IRC)**:

$$\text{IRC}_{\text{cantón}} = \frac{\text{Denuncias Extorsión (FGE)} + \alpha \cdot \text{Detenciones FICE}}{\text{Número de Locales Comerciales Registrados (INEC)}} \times 1.000$$

Donde:
* $\alpha$ es un factor de ponderación para operativos policiales efectivos.
* El denominador utiliza el Directorio de Empresas y Establecimientos del INEC.

### Semáforo de Riesgo en el Mapa

> [!info] Alcance real de la V1 (2026-09-26)
> El IRC completo (denuncias + detenciones, ponderado por locales
> comerciales del DIEE-INEC) **queda pospuesto para V2**: el directorio de
> establecimientos todavía no está incorporado al proyecto. La V1 implementa
> una versión más simple: la **tasa de denuncias de extorsión por 100.000
> habitantes**, usando la población cantonal ya cargada
> (`canton_population`), agrupada en **cuartiles calculados sobre el propio
> año** (no umbrales fijos) entre los cantones con al menos una denuncia. Es
> decir, "bajo/moderado/alto/crítico" son relativos a cómo se distribuyen las
> tasas ese año, no una escala absoluta de gravedad. Los cantones sin
> denuncias ese año se marcan aparte ("sin denuncias"), no como "bajo".

En la V1, el usuario puede activar la capa **«Extorsión»** en el mapa, que
tiñe los cantones según el cuartil de su tasa de denuncias del año
seleccionado:

| Nivel | Descripción para el Comerciante / Inversionista |
|---|---|
| **Bajo** | Tasa de denuncias en el 25% más bajo de los cantones con al menos una denuncia ese año. |
| **Moderado** | Entre el percentil 25 y 50. |
| **Alto** | Entre el percentil 50 y 75. |
| **Crítico** | Tasa en el 25% más alto. |

La escala de colores se atenúa para respetar la paleta "Registro Oficial" del
producto (ver DESIGN.md, regla de dos matices) y se refuerza con un cambio de
saturación/patrón, no solo de tono, para mantenerse legible para daltonismo.
La versión con semáforo tradicional verde/amarillo/naranja/rojo y umbrales
absolutos de la tabla original queda como diseño de referencia para cuando
el IRC completo (V2) esté listo.

---

## 4. Salvaguardas de Privacidad y Ética (LOPDP)

1. **Nunca georreferenciar denuncias individuales a nivel de local:** Revelar qué local específico denunció una extorsión pone en riesgo inminente la vida del comerciante. La información se muestra **agregada por cantón o parroquia**.
2. **Atribución y contexto:** Se debe aclarar explícitamente que el índice mide denuncias formales y operativos; cantones con baja cultura de denuncia pueden aparentar menor riesgo del real.
3. **Casos de uso comercial:** Este índice es el núcleo para vender consultoría de riesgo y reportes actuariales a aseguradoras, entidades bancarias y cadenas de franquicias en expansión ([[Modelo de Monetización]]).
