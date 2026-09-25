---
tags: [archivo, arquitectura, analitica, descartado]
actualizado: 2026-09-24
estado: descartado
---

# Almacén Analítico (Descartado)

> [!CAUTION] Documento descartado — 2026-09-24
> Este documento describía un experimento paralelo para evaluar **Amazon Redshift Serverless** y **Microsoft Fabric Warehouse**.
> **Decisión: Se descarta formalmente.**
> **Motivos:**
> 1. **Volumen de datos:** Los datos históricos del Ministerio del Interior (2019–2026) suman menos de 400.000 filas. PostgreSQL con PostGIS y optimización de índices agrega y consulta este volumen en milisegundos sin requerir un Data Warehouse columnar.
> 2. **Cero sobreingeniería:** Mantener un pipeline dual (OLTP en PostgreSQL + OLAP en Redshift/Fabric) añade complejidad innecesaria, costes de cómputo en la nube e introduce dependencias externas de AWS y Azure que desvían recursos del producto central.
> 3. **Consolidación del stack:** Toda la plataforma opera de manera unificada y soberana sobre **PostgreSQL 17 + PostGIS 3** en el servidor propio.
>
> Se conserva esta nota en `Archivo/` únicamente como registro histórico de decisiones evaluadas.

---

## Contenido original archivado

### Qué es un almacén de datos (data warehouse)

Hay dos formas de usar una base de datos:

| | Operacional (OLTP) | Analítica (OLAP) |
|---|---|---|
| Ejemplo | **PostgreSQL** | **Redshift**, Fabric Warehouse |
| Trabajo típico | Guardar un incidente, leer uno, actualizar su estado | «Homicidios por provincia y mes de 2019 a 2026» |
| Cómo guarda | Fila por fila | Columna por columna |
| Pensada para | Muchas operaciones pequeñas y rápidas | Pocas consultas enormes sobre millones de filas |

### Por qué no es necesario para el volumen actual

Los datasets suman del orden de **cientos de miles de filas**, menos de un millón. PostgreSQL agrega ese volumen en fracciones de segundo con índices y vistas materializadas. Un almacén de datos empieza a compensar con decenas o cientos de millones de filas.
