---
tags: [datos, esquema, etl]
actualizado: 2026-09-22
---

# Esquema de Campos

Campos verificados leyendo los diccionarios de variables y los archivos de
datos de enero–agosto 2026. Ver resultados de validación en [[Calidad de Datos]].

> [!success] Hallazgo determinante
> Los tres datasets incluyen **coordenadas punto por incidente** en WGS84
> grados decimales. No son agregados por cantón. Esto habilita un mapa de
> pines y descarta el coroplético como única opción.

## Homicidios Intencionales

| Campo | Columna | Nota |
|---|---|---|
| `tipo_muerte` | — | Homicidio · Asesinato · Femicidio · Sicariato (tipificación COIP) |
| `zona`, `subzona`, `distrito`, `circuito` | — | División territorial SENPLADES |
| `codigo_subcircuito`, `subcircuito` | — | |
| `codigo_provincia`, `provincia` | — | |
| `codigo_canton`, `canton` | — | |
| **`coordenada_y`** | L | **Latitud** |
| **`coordenada_x`** | M | **Longitud** |
| `area_hecho` | — | Urbano · Rural |

## Personas Desaparecidas

| Campo | Columna | Nota |
|---|---|---|
| `fecha_denuncia`, `fecha_desaparicion`, `fecha_conocimiento` | — | Tres fechas distintas |
| `zona`, `distrito`, `circuito`, `subcircuito` | — | |
| `provincia`, `canton` | — | |
| **`latitud`**, **`longitud`** | L, M | Lugar de la desaparición |
| **`latitud_localizacion`**, **`longitud_localizacion`** | T, U | Lugar donde fue localizada |
| `sexo`, `nacionalidad`, `edad`, `rango_edad`, `etnia` | — | `rango_edad`: Niños/as · Adolescentes · Adultos · Adultos mayores |

> [!tip] Oportunidad de producto
> El segundo par de coordenadas permite una capa de **casos abiertos frente a
> resueltos**, e incluso vectores de desplazamiento entre desaparición y
> localización. En 2026, 821 de 5.216 casos (15,7 %) siguen sin localizar.

## Personas Detenidas y Aprehendidas

| Campo | Columna | Nota |
|---|---|---|
| `codigo_iccs` | — | Clasificación Internacional del Delito (ICCS) |
| `tipo` | — | Detenido o aprehendido |
| `fecha_detencion_aprehension`, `hora_detencion_aprehension` | — | Incluye hora |
| `lugar` | — | Descripción textual |
| **`latitud`**, **`longitud`** | AH, AI | |
| `estado_civil`, `estatus_migratorio`, `edad`, `sexo`, `genero` | — | |
| `nacionalidad`, `autoidentificacion_etnica` | — | |

## Trampas de ingesta

Ninguna es un error del dato: son convenciones de origen que rompen un parser
escrito sin mirar el archivo.

### 1. El separador decimal es COMA

Los valores llegan como `-3,28012`, no `-3.28012`. Un `float()` ingenuo produce
nulos o basura **en silencio**. Debe ser el primer caso cubierto por un test
del ETL.

### 2. Los nombres de columna difieren entre datasets

Homicidios usa `coordenada_y` / `coordenada_x` con la **latitud primero**; los
otros dos usan `latitud` / `longitud`. Mapear siempre **por nombre de campo,
nunca por posición**, y normalizar durante la ingesta.

### 3. Hay centinelas de texto en columnas numéricas

Aparecen `NO_APLICA` y `SIN DATO` dentro de campos de coordenadas. `NO_APLICA`
en `latitud_localizacion` no significa dato faltante: significa que la persona
todavía no ha sido localizada.

### 4. Los datos están en la SEGUNDA hoja del XLSX

La primera hoja (`Contenido`) es una portada de metadatos. La hoja de datos es
la segunda.

### 5. Ruido de precisión flotante

La mediana de decimales varía por dataset: 5 en homicidios, 9 en detenidos, 17
en desaparecidas (artefactos de coma flotante del tipo
`0,0789635999999999949`). Cinco decimales equivalen a ~1 metro; no conviene
atribuir significado a la precisión adicional.
