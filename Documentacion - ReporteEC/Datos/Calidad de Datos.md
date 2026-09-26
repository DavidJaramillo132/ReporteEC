---
tags: [datos, calidad, verificacion]
actualizado: 2026-09-22
---

# Calidad de Datos

Validación ejecutada el 2026-09-22 sobre los archivos de enero–agosto 2026 de
los tres datasets del Ministerio del Interior. **61.445 filas analizadas.**

## Cobertura de coordenadas

| Dataset | Filas | Campos geo | Pobladas | Coords distintas |
|---|---|---|---|---|
| Homicidios Intencionales | 5.676 | `coordenada_y` / `coordenada_x` | 100 % | 4.564 (80,4 %) |
| Personas Desaparecidas | 5.216 | `latitud` / `longitud` | 100 % | 4.729 (90,7 %) |
| Detenidos y Aprehendidos | 50.553 | `latitud` / `longitud` | 100 % | 44.955 (88,9 %) |

> [!success] Son puntos reales, no centroides
> El ratio de 80–91 % de coordenadas distintas es la prueba. Si estuvieran
> ajustadas al centro de la parroquia o del subcircuito, cientos de filas
> compartirían el mismo punto; la repetición máxima observada es de 29 a 58
> casos, coherente con focos genuinos (misma esquina, mismo punto de control).

## Validación de integridad

| Chequeo | Homicidios | Desaparecidas | Detenidos |
|---|---|---|---|
| Coordenadas no numéricas | 0 | 0 | 0 |
| `(0,0)` null island | 0 | 0 | 0 |
| Latitud/longitud invertidas | 0 | 0 | 0 |
| Fuera del territorio ecuatoriano | 0 | 0 | 0 |

**Cero anomalías.** Es una calidad superior a la habitual en portales de datos
abiertos, donde suele esperarse entre un 2 y un 5 % de coordenadas
inutilizables.

Registros en Galápagos, correctamente ubicados: 2 en desaparecidas, 246 en
detenidos.

## Lo único que parecía error y no lo es

En `latitud_localizacion` / `longitud_localizacion` aparecen 13 puntos fuera de
Ecuador. Revisados individualmente:

| Coordenada | Ubicación |
|---|---|
| `-11.641919, -76.821262` | Región de Lima, Perú |
| `3.441888, -76.528433` | Cali, Colombia |
| `4.337420, -74.372056` | Cercanías de Bogotá, Colombia |

Son **personas desaparecidas en Ecuador localizadas en el extranjero**. Dato
legítimo y probablemente de los más relevantes del conjunto.

## Conclusión operativa

No hace falta una capa de limpieza defensiva. Hace falta:

1. Un parser que **respete la convención de origen** (coma decimal, centinelas,
   segunda hoja) — ver [[Esquema de Campos]]
2. Validación de bounding box como **red de seguridad**, no como reparación
3. Tratar los puntos en el extranjero como válidos, no descartarlos

## Homicidios 2019: 810 de 1.189 casos sin coordenada propia (verificado 2026-09-26)

La validación de arriba solo cubrió el archivo parcial de 2026; el archivo
histórico 2014-2025 se comporta distinto en su año más antiguo. Al cargar
homicidios con `--force` para la Fase 5:

- **2019 total: 1.189 casos.** De ellos, **810 (68 %) no traen
  `coordenada_y`/`coordenada_x` utilizable** (vacía o `(0,0)`) pero sí un
  `codigo_canton` válido. El resto de 2019 (379 casos) y todos los años
  2020-2026 traen coordenada propia, sin excepción.
- Estos 810 casos **se cargan igual**, con `location_precision='canton'` y la
  geometría del centroide del propio cantón (`ST_PointOnSurface`, no
  `ST_Centroid`; ver [[Fuentes]] y `app/modules/ingestion/loader.py`). Se
  **cuentan en las estadísticas** (`GET /api/stats`) pero **no se dibujan en
  el mapa** (`map_incidents` excluye `location_precision='canton'`): la
  fuente no publicó dónde exactamente ocurrió el caso, y su cantón corrige
  eso sin inventar una coordenada.
- Solo 1 caso más, en 2024, tiene el mismo problema — un caso aislado, no un
  patrón por año.
- **Ningún caso de ningún año queda sin canton_code**: cuando falta la
  coordenada, el `codigo_canton` de la propia fila siempre está presente; el
  cargador rechaza (no carga) un caso sin coordenada **y** sin cantón
  reconocible, cosa que no ocurrió en ninguna fila revisada.

## Personas desaparecidas: la señal de "localizada" no es una sola columna

`app/modules/ingestion/adapters/mdi_desaparecidas.py` ya documentaba esto en
código; se deja constancia aquí porque ahora afecta directamente a las
estadísticas. Una persona deja de considerarse desaparecida por **cualquiera**
de dos señales independientes, no solo una:

1. `latitud_localizacion`/`longitud_localizacion` dejan de ser `NO_APLICA`, o
2. `situacion_actual` pasa a `ENCONTRADO` o `FALLECIDO`.

El archivo histórico 2017-2025 solo rellenó las coordenadas de localización
para casos de 2025; todo caso 2019-2024 ya resuelto por `situacion_actual`
sigue con `NO_APLICA` en las coordenadas. Tratar solo la señal 1 como válida
habría dejado miles de personas ya localizadas marcadas como desaparecidas.
En el ambiente de desarrollo: **57.076 de 60.227 casos de tipo
`desaparecida` (95 %) están localizados** (`located_at` no nulo).

Un caso localizado **sale del mapa** (`map_incidents` exige
`located_at IS NULL`) pero **sigue contando en las estadísticas**
(`GET /api/stats` no filtra por `located_at`): es una persona que sí
desapareció, aunque ya no siga desaparecida hoy.

## Detenciones: 1.613 filas sin provincia ni cantón (código `0000`/`00`)

Hallazgo de la validación de cobertura territorial de la Fase 5
(`python -m app.modules.ingestion population`/`cantons`, sección
`validate_coverage` en `app/modules/ingestion/territory.py`): **1.613 filas
de Detenidos y Aprehendidas** traen `province_code='00'`/`canton_code='0000'`
(campo vacío en la fuente, rellenado con ceros). No ocurre en ningún caso de
homicidios ni desaparecidas. Se cargan igual (una detención sin ubicación
territorial sigue siendo una detención real) y aparecen en
`GET /api/stats?layer=detentions` bajo la clave `"00"`/`"0000"`, con
población 0 y sin tasa -- visibles, no descartadas en silencio.
