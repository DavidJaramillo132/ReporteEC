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
