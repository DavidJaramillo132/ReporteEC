# Scripts de inspección

Utilidades usadas para verificar los datasets del Ministerio del Interior.
Leen XLSX sin dependencias externas (parsean el ZIP/XML directamente), por lo
que funcionan sin instalar `openpyxl` ni `pandas`.

| Script | Uso |
|---|---|
| `leer_xlsx.py` | `python3 leer_xlsx.py <archivo> [hoja] [filas]` — vuelca celdas |
| `cobertura_geo.py` | `SHEET=1 python3 cobertura_geo.py <archivo>` — mide relleno de columnas geográficas |
| `validar_coordenadas.py` | `python3 validar_coordenadas.py <archivo> <colLat> <colLon> <nombre>` — valida contra el bounding box de Ecuador |
| `scraper_policia.py` | `python3 scraper_policia.py [--hours N \| --since ISO]` — prototipo: noticias de la Policía vía API de WordPress, en JSON por línea |

Hallazgos documentados en `../../Documentacion - ReporteEC/Datos/Calidad de Datos.md`.
