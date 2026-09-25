---
tags: [version, v1, mapa-historico]
actualizado: 2026-09-23
estado: por empezar
---
# V1 — Mapa Histórico

> [!abstract] Objetivo
> Un mapa público, rápido y confiable con **todos los datos oficiales desde
> 2019**, que explique con claridad de dónde sale cada dato. Funciona solo,
> sin cuentas ni tiempo real, pero construido para que la [[V2 - Rutas e Inteligencia Horaria]]
> y las siguientes versiones se sumen sin rehacer nada.

Visión general de las versiones en [[Hoja de Ruta]].

---

## Fase 0 — Cimientos

Antes de construir funciones, probar que el stack funciona de punta a punta.

1. Crear la estructura de `codigo/`: `backend/`, `frontend/`, `despliegue/`
   ([[Módulos del Sistema]])
2. Crear los proyectos: frontend con **Bun** y backend con **uv**
   ([[Stack e Infraestructura]], «Entorno de desarrollo»)
3. Levantar Docker Compose con PostgreSQL + PostGIS
4. **Esqueleto:** homicidios de 2026 → PostGIS → Martin → puntos en el mapa del
   navegador
5. Verificar fuentes pendientes: población por cantón del INEC y año de inicio
   de los siniestros del INEC

**Se termina cuando** aparecen puntos reales en un mapa en el navegador. Si
ese camino funciona, el [[Stack e Infraestructura]] queda probado.

---

## Qué trae la V1

### Datos

| Fuente                                       | Cómo se muestra                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Homicidios intencionales                     | Puntos + mapa de calor                                                      |
| Personas desaparecidas                       | Puntos + mapa de calor; las**localizadas se quitan del mapa**         |
| Detenidos y aprehendidos                     | **Capa aparte**, solo mapa de calor, rotulada como actividad policial |
| Extorsión y vacunas a negocios (FGE / OECO) | **Por cantón**, semáforo de riesgo comercial ([[Extorsión y Vacunas a Negocios]])                     |
| Siniestros de tránsito (INEC)               | **Por cantón** (no hay coordenadas)                                  |
| Población por cantón (INEC)                | No se muestra; sirve para calcular tasas                                    |
| Robos                                        | **Por definir** — no hay fuente oficial                              |

Todo desde **2019**, el primer año en que todos los datasets tienen datos.
Tipos de incidente según [[Tipos de Incidente]].

### Páginas

| Página                      | Qué contiene                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Inicio**             | Qué es ReporteEC, qué muestra y qué no, cómo leer el mapa (colores = confianza, íconos = tipo) y accesos a las demás páginas |
| **Mapa**               | La vista principal: capas, filtros y detalle de cada incidente                                                                      |
| **Estadísticas**      | Gráficos por tipo, provincia, cantón y mes, con conteo y tasa                                                                     |
| **Metodología**       | Cómo se construye cada dato (ver abajo)                                                                                            |
| **Licencia y fuentes** | Atribución de cada fuente, licencia de los datos abiertos, licencia de la plataforma y aviso de responsabilidad                    |

### Mapa

- **Puntos al acercar, mapa de calor al alejar**
- **Color del marcador = nivel de confianza** (🟢🔵🟡🟠); **ícono = tipo**
  ([[Niveles de Confianza]])
- **Detalle al tocar un punto:** tipo, fecha, lugar, fuente, nivel de confianza
  y enlace a la fuente original
- **Filtros:** año (2019 → hoy), mes, provincia, cantón, tipo
- **Nota metodológica visible:** el mapa muestra denuncias, no todo el delito
  que ocurre

### Estadísticas

- Por tipo, provincia, cantón y mes
- **Conteo** (cuántos casos) y **tasa por 100.000 habitantes** (qué tan
  probable es por persona), siempre juntos
- Aviso en cantones con muy poca población, donde la tasa varía mucho con
  pocos casos

### Página de metodología

Es obligatoria en la V1 porque es donde se explica de dónde sale la
información. Debe explicar:

- **De dónde sale cada dato:** fuente, frecuencia de actualización y rezago
  (el Ministerio publica cada mes con ~1 mes de retraso)
- **Qué significa cada nivel de confianza** y por qué el color no cambia con el
  año
- **Conteo frente a tasa:** qué es el total de casos, qué es la tasa por
  100.000 habitantes y cuándo usar cada uno, con un ejemplo
- **Denuncias frente a delitos:** el mapa refleja lo que se denuncia; donde se
  denuncia menos, parece que pasa menos
- **Por qué los detenidos van aparte:** son actividad policial, no inseguridad
- **Por qué los siniestros van por cantón:** la fuente no publica coordenadas
- **Por qué el mapa empieza en 2019**
- **Qué pasa con las personas desaparecidas localizadas**
- **Qué datos personales no se muestran nunca** (etnia, nacionalidad,
  estatus migratorio)

### Página de licencia y fuentes

- Atribución de cada fuente: Ministerio del Interior, INEC
- **Licencia de los datos abiertos** del portal `datosabiertos.gob.ec`
  *(revisar sus condiciones exactas)*
- Licencia de la propia plataforma y de su código
- **Aviso de responsabilidad:** la información proviene de terceros y se
  muestra con su nivel de confianza; ReporteEC no afirma que los hechos
  ocurrieron

### Ingesta y datos

- **Modelo de datos definitivo desde el inicio**, con los campos que usará la
  V2: `fuente`, `nivel_confianza`, `estado`, `fusionado_con`,
  `location_precision`, identificador de origen. `vigencia` se calcula a partir
  de la fecha
- **Un adaptador por fuente** en `backend/app/modules/ingestion/`
- **Worker histórico** que revisa CKAN a diario y carga solo archivos nuevos
- **Tabla `pipeline_runs`**: cada ejecución queda registrada con registros
  procesados, duplicados y errores
- **Ingesta idempotente:** correrla dos veces da el mismo resultado

### Despliegue

- VPS Ubuntu en Azure, Docker Compose, Caddy con HTTPS, dominio en GoDaddy
- Respaldo diario de la base de datos
- **PWA instalable**, solo consulta

---

## Orden de desarrollo

| # | Tarea                                                  | Por qué en este orden                                    |
| - | ------------------------------------------------------ | --------------------------------------------------------- |
| 1 | Fase 0: esqueleto de punta a punta                     | Prueba el stack antes de invertir en funciones            |
| 2 | Modelo de datos definitivo                             | Cambiarlo después obliga a migrar todo                   |
| 3 | Ingesta de los tres datasets del Ministerio, con tests | Sin datos no hay mapa                                     |
| 4 | Mapa: capas, colores, íconos, mapa de calor, detalle  | Es el corazón del producto                               |
| 5 | Filtros                                                |                                                           |
| 6 | Población y estadísticas                             | La tasa necesita la población                            |
| 7 | Siniestros y riesgo de extorsión por cantón          | Otra forma de dibujar; coropletos y semáforos cantonales |
| 8 | Páginas: inicio, metodología, licencia y fuentes     | Explican lo que ya existe                                 |
| 9 | PWA, despliegue, respaldos                             | Para publicarlo                                           |

## Qué evitar

- **Adelantar funciones de la V2.** Nada de cuentas, Redis ni tiempo real. Lo
  único que se prepara es el modelo de datos.
- **Ingesta que duplica.** Se guarda el identificador de origen de cada
  registro para que volver a cargar no cree copias.
- **Probar solo con datos inventados.** Los tests del parser usan los XLSX
  reales: coma decimal, centinelas, datos en la segunda hoja
  ([[Esquema de Campos]]).
- **Mandar todos los puntos al navegador de una vez.** Son cientos de miles;
  el mapa se sirve en teselas.

---

## Cómo probarla tú mismo

Lista para revisar a mano antes de dar la V1 por terminada.

### Datos

- [ ] Homicidios, desaparecidas y detenidos aparecen desde 2019
- [ ] El total de homicidios de un año coincide con el total del archivo
  oficial de ese año
- [ ] Ningún punto cae fuera de Ecuador
- [ ] Correr la ingesta dos veces no duplica registros
- [ ] Una persona desaparecida con fecha de localización no aparece en el mapa

### Mapa

- [ ] Los puntos se ven al acercar y el mapa de calor al alejar
- [ ] Los detenidos solo aparecen al activar su capa, y nunca mezclados con
  los incidentes
- [ ] Cada marcador tiene el color de su nivel de confianza y el ícono de su
  tipo
- [ ] Tocar un punto muestra tipo, fecha, lugar, fuente y enlace
- [ ] Cambiar de año no cambia el color de los marcadores
- [ ] El mapa carga rápido con todos los años activados

### Filtros y estadísticas

- [ ] Filtrar por provincia, cantón, tipo, año y mes cambia el mapa y las cifras
- [ ] Cada tasa aparece junto a su conteo
- [ ] Los siniestros se ven por cantón

### Páginas

- [ ] La página de inicio explica qué es la plataforma y cómo leer el mapa
- [ ] La metodología explica conteo, tasa, niveles de confianza y denuncias
- [ ] La página de licencia atribuye cada fuente

### Instalación

- [ ] La PWA se instala en Android y en iPhone
- [ ] El sitio carga por HTTPS con el dominio propio

## Terminada cuando

Todas las casillas anteriores están marcadas y el sitio está publicado en el
dominio.
