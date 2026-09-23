---
tags: [arquitectura, analitica, experimento]
actualizado: 2026-09-23
---

# Almacén Analítico

> [!info] Estado
> **Experimento paralelo, no parte del camino crítico.** PostgreSQL + PostGIS
> sigue siendo la base de datos del sistema. El almacén analítico recibe una
> **copia** para aprender y comparar Amazon Redshift con su equivalente en
> Azure. Ver [[Hoja de Ruta]].

## Qué es un almacén de datos (data warehouse)

Hay dos formas de usar una base de datos:

| | Operacional (OLTP) | Analítica (OLAP) |
|---|---|---|
| Ejemplo | **PostgreSQL** | **Redshift**, Fabric Warehouse |
| Trabajo típico | Guardar un incidente, leer uno, actualizar su estado | «Homicidios por provincia y mes de 2019 a 2026» |
| Cómo guarda | Fila por fila | Columna por columna |
| Pensada para | Muchas operaciones pequeñas y rápidas | Pocas consultas enormes sobre millones de filas |

Una analogía: PostgreSQL es la **caja registradora**, que anota cada venta al
instante; el almacén de datos es la **oficina de contabilidad**, que analiza
años de ventas.

Guardar por columnas hace que sumar o promediar una columna sobre cientos de
millones de filas sea muy rápido, porque solo lee esa columna. A cambio,
modificar registros sueltos es lento. Por eso **no reemplaza a PostgreSQL**:
se usan juntos.

## Amazon Redshift

El almacén de datos de AWS. Dos modalidades:

- **Serverless:** se paga por el cómputo usado mientras hay consultas. La
  mejor opción para experimentar.
- **Provisionado:** un clúster encendido todo el tiempo, con costo fijo por
  hora.

**Prueba gratuita:** las cuentas que nunca usaron Redshift Serverless reciben
**300 USD en créditos válidos por 90 días**. No forma parte de la capa
gratuita general de AWS. ([fuente](https://aws.amazon.com/redshift/free-trial))

## Equivalente en Azure

| Servicio | Situación |
|---|---|
| **Microsoft Fabric Warehouse** | Dirección actual de Microsoft; sucesor de Synapse |
| Azure Synapse Analytics (dedicated SQL pool) | El equivalente clásico y más directo de Redshift; sigue soportado |

**Recomendado para probar: Fabric Warehouse**, porque es donde Microsoft está
invirtiendo. **Prueba gratuita:** capacidad de prueba (F64) por **60 días**.
([fuente](https://learn.microsoft.com/en-us/fabric/fundamentals/fabric-trial))

## Por qué no es necesario para el volumen actual

Los datasets suman del orden de **cientos de miles de filas**, menos de un
millón. PostgreSQL agrega ese volumen en fracciones de segundo con índices y
vistas materializadas. Un almacén de datos empieza a compensar con decenas o
cientos de millones de filas. Por eso aquí es un **experimento de
aprendizaje**, no una necesidad.

## Cómo encaja

```
PostgreSQL + PostGIS  (fuente de verdad)
        │
        ▼
analytics_sync  (worker del backend)
        │
   ┌────┴────┐
   ▼         ▼
Redshift   Fabric Warehouse
```

- Un worker exporta los datos a cada almacén. Cada ejecución queda
  registrada en `pipeline_runs`.
- En el almacén se organiza como **esquema en estrella**: una tabla de hechos
  (`fact_incidents`) y tablas de dimensiones (`dim_date`, `dim_location`,
  `dim_type`, `dim_source`). Es el modelo estándar de estos sistemas.
- **El mapa y la API no dependen del almacén.** Si se apaga, la plataforma
  sigue funcionando.

## Qué comparar

- Tiempo de carga de los datos
- Velocidad de las mismas consultas en PostgreSQL, Redshift y Fabric
- Facilidad de uso y herramientas de cada uno
- **Costo real** al terminar cada prueba

> [!warning] Costos
> Pausar o eliminar los recursos al terminar cada sesión de prueba. Al
> acabarse los créditos, los dos servicios pasan a cobrar.
