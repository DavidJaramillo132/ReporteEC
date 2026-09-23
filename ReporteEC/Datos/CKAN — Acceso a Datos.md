---
tags: [datos, ckan, etl]
actualizado: 2026-09-22
---

# CKAN — Acceso a Datos

## Qué es CKAN

`datosabiertos.gob.ec` funciona sobre **CKAN** (*Comprehensive Knowledge
Archive Network*), una plataforma open source en Python desarrollada por la
Open Knowledge Foundation para publicar portales de datos abiertos.

No es una tecnología ecuatoriana: la usan `data.gov` (EE.UU.), `data.gov.uk` y
buena parte de los portales gubernamentales de la Unión Europea y América
Latina. La consecuencia práctica es que **todo portal CKAN expone la misma API
REST estándar**, de modo que no hace falta scrapear HTML para descubrir qué
archivos existen ni dónde están.

## Modelo de datos

CKAN organiza la información en dos niveles:

- **dataset** (o *package*) — el conjunto. Ejemplo: «Homicidios Intencionales»
- **resource** — cada archivo dentro del conjunto: el XLSX de 2026, el
  histórico, el diccionario de variables

## Endpoints relevantes

```
/api/3/action/package_show?id=<slug>    # un dataset y todos sus archivos
/api/3/action/package_search?q=<texto>  # buscar datasets
/api/3/action/package_list              # listar todos los slugs
```

Ejemplo concreto:

```
https://www.datosabiertos.gob.ec/api/3/action/package_show?id=homicidios-intencionales
```

Devuelve JSON con las URLs de descarga de cada recurso más los metadatos
relevantes: `frequency` (`Mensual`) y fecha de última actualización.

## Regla para el ETL

> [!warning] No hardcodear URLs de descarga
> Las URLs contienen un UUID que **cambia cada vez que se publica un archivo
> nuevo**. Si se fijan en el código, la ingesta se rompe el mes siguiente.
> Resolviéndolas mediante `package_show`, se adapta sola.

## Identificadores de los datasets

| Dataset | Slug | UUID |
|---|---|---|
| Homicidios Intencionales | `homicidios-intencionales` | `0ec65ab4-e6ab-40ab-aab9-c91e912f9faf` |
| Personas Desaparecidas | `personas-desaparecidas` | `bb80c831-a3e6-4be2-b248-7ef0f6ccaedc` |
| Detenidos y Aprehendidos | `personas-detenidas-aprehendidas` | `f8dfe0b7-9192-49db-927d-cdf8bf716d92` |

El slug es estable y es el identificador que conviene usar. El UUID se incluye
solo como referencia.
