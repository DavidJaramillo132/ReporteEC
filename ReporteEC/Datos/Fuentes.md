---
tags: [datos, fuentes]
actualizado: 2026-09-22
---

# Fuentes

> [!tip] Criterio permanente
> Usar siempre los datos más actualizados disponibles.

## Oficiales — Ministerio del Interior

Publicados en el portal de datos abiertos del Estado. Los tres comparten
características: formato **XLSX** (no CSV, no API de consulta), frecuencia de
actualización **mensual**, y una fila por caso individual con coordenadas
propias ([[Esquema de Campos]]).

| Dataset | Slug | Cobertura histórica | Última publicación |
|---|---|---|---|
| Homicidios Intencionales | `homicidios-intencionales` | 2014–2025 + 2026 | 2026-09-18 |
| Personas Desaparecidas | `personas-desaparecidas` | 2017–2025 + 2026 | 2026-09-17 |
| Personas Detenidas y Aprehendidas | `personas-detenidas-aprehendidas` | 2019–2025 + 2026 | — |

URLs de los datasets:

- https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales
- https://www.datosabiertos.gob.ec/dataset/personas-desaparecidas
- https://www.datosabiertos.gob.ec/dataset/personas-detenidas-aprehendidas

> [!warning] Rezago real
> El archivo publicado el 18 de septiembre de 2026 cubre hasta **agosto**.
> Aproximadamente un mes de retraso. Estas fuentes **no sirven** para la capa
> de tiempo casi real ([[Riesgos Abiertos]]).

Cada dataset incluye además un **diccionario de variables** (`_dd_`) que
documenta campo por campo. Es la referencia autoritativa del esquema.

## Pendiente de evaluar

**Fallecidos por accidentes de tránsito (SPPAT)**
https://www.datosabiertos.gob.ec/dataset/fallecidos-por-accidentes-de-transito-registradas-por-el-sppat

Marcado como «revisar» en la nota original. No se ha verificado si incluye
coordenadas punto.

## No estructurada

**Noticias de la Policía Nacional** — https://noticias.policia.gob.ec/
(apartado «Últimas»)

Única vía hacia información casi inmediata, pero exige scraping. Ver el riesgo
asociado en [[Riesgos Abiertos]].

## Cómo acceder a los archivos

Las URLs de descarga contienen un UUID que **cambia en cada publicación**.
Resolverlas dinámicamente: ver [[CKAN — Acceso a Datos]].
