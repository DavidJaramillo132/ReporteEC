---
tags: [datos, scraper, tiempo-real, v2]
actualizado: 2026-09-22
---

# Scraper Noticias Policía

Fuente del tiempo real en la v2 ([[Hoja de Ruta]]). Prototipo funcionando en
`codigo/scripts/scraper_policia.py`.

## Hallazgo principal: no hace falta scrapear HTML

`noticias.policia.gob.ec` funciona con **WordPress**, y WordPress trae una
**API REST pública** que devuelve las noticias en JSON:

```
https://noticias.policia.gob.ec/wp-json/wp/v2/posts
```

- El `robots.txt` **permite todo** (`Disallow:` vacío).
- Responde con id, fechas, título, resumen, enlace y categorías.
- Admite filtrar por fecha (`after=`), así que se piden solo las noticias nuevas.
- 7.292 noticias publicadas al 2026-09-22.

Frente a scrapear HTML, esto es mucho más estable: un cambio de diseño de la
página no rompe la API.

## Categorías útiles

El sitio ya clasifica sus noticias. Ids verificados el 2026-09-22:

| Id | Categoría del sitio | Noticias | Tipo en ReporteEC |
|---|---|---|---|
| 74 | Asesinato | 299 | asesinato |
| 77 | Tentativa de asesinato | 70 | tentativa_asesinato |
| 87 | Sicariato | 47 | sicariato |
| 81 | Robo | 319 | robo |
| 257 | Asalto y Robo | 45 | robo |
| 7 | Secuestro y Extorsión | 1.061 | secuestro_extorsion |
| 280 | Extorsión | 88 | extorsion |
| 95 | Delito de violación | 63 | **se descarta** — violencia sexual solo entra desde fuentes oficiales ([[Tipos de Incidente]]) |
| 59 | Tráfico de armas de fuego | 412 | trafico_armas |
| 2, 268 | Drogas | 1.290 / 102 | drogas |
| 86, 71 | Delincuencia organizada | 1.317 / 605 | delincuencia_organizada |

Se descartan «En comunidad», «Institucional» y similares, que no son
incidentes.

## Limitaciones verificadas

> [!warning] Son resultados policiales, no incidentes en vivo
> En una muestra de 100 noticias, **55 títulos hablan de aprehendidos**. El
> sitio informa lo que hizo la Policía (capturas, decomisos, operativos),
> normalmente horas o días después del hecho, no el incidente en el momento
> en que ocurre. Tiene la misma naturaleza que el dataset de detenidos.

- **Poco volumen:** entre 3 y 17 noticias por día en todo el país (promedio
  ~7). Con una ventana de «Actualidad» de 1 h 30, la mayor parte del tiempo
  habría cero o una noticia a la vista.
- **Sin coordenadas:** el lugar viene en el texto. En la prueba, 6 de 10
  noticias traían lugar en el título, casi siempre **provincia o cantón**
  («en Esmeraldas», «en Quinindé, Esmeraldas»). Solo se puede ubicar a ese
  nivel, no en la calle.
- **Nivel de confianza:** 🟡 Reportado.

**Consecuencia para la v2:** esta fuente sirve como capa de **noticias
policiales** complementaria, pero **el tiempo real de verdad va a venir de los
reportes ciudadanos**.

## Diseño del adaptador (v2)

1. Cada pocos minutos, pedir las noticias con `after=` igual a la última fecha
   procesada.
2. Clasificar por categoría; descartar las que no son incidentes.
3. Extraer el lugar del título y, si no aparece, del resumen.
4. **Geocodificar contra la tabla de cantones y provincias** (no contra un
   servicio externo): el punto se ubica en el centro del cantón y se marca
   como ubicación aproximada.
5. Cargar en la tabla única con `fuente = policia_noticias` y
   `nivel_confianza = reportado`.
6. Guardar el `id` de WordPress para no duplicar y para detectar ediciones
   (`modified`).

Buenas prácticas: identificarse con un User-Agent propio, pausar entre
páginas y no pedir más de lo necesario.

## Prueba del prototipo (2026-09-22, últimas 72 h)

- 21 noticias recibidas
- 10 clasificadas como incidente, 11 descartadas
- 6 de las 10 con lugar extraído del título
