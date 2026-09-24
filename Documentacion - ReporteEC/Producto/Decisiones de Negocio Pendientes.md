---
tags: [producto, decisiones, logica-negocio]
actualizado: 2026-09-22
---

# Decisiones de Negocio Pendientes

Incoherencias y huecos en la lógica del producto detectados al contrastar
[[Ideas Sueltas]] con los datos ya verificados en [[Calidad de Datos]].

> [!important] Por qué esto es urgente
> La mayoría no son defectos, son **decisiones todavía no tomadas**. Si no se
> resuelven, las tomará el código por omisión. Las decisiones 1, 3 y 5
> condicionan el esquema de base de datos y deben cerrarse **antes** del ETL.

Ordenadas por impacto.

## Decisiones tomadas

> [!success] 2026-09-22 — Alcance del mapa
> El mapa cubre **ambos modos**: tiempo real y consulta histórica (por
> ejemplo, ver todo 2025). Muestra dónde ocurrió cada hecho e incluye
> **choques y siniestros de tránsito, delitos, robos y demás incidentes**.
> Además debe mostrar las **zonas donde estos hechos ocurren con más
> frecuencia**.
>
> Resuelve el punto 2 (se mantiene el tiempo real, asumiendo su techo de
> confianza 🟡) y el punto 7 (el modo histórico entra en el producto).
> **No resuelve el punto 1**: los detenidos no figuran en la lista de hechos.

> [!success] 2026-09-22 — Detenidos
> Los detenidos y aprehendidos **entran al mapa como mapa de calor**, no
> como puntos individuales, y se usan también en **estadísticas**.
>
> Resuelve el punto 1. Condiciones para que la decisión funcione:
>
> - **Capa propia**, separada de los incidentes, con activación explícita y
>   rotulada como *actividad policial*, no como *inseguridad*.
> - Nunca sumada ni mezclada con homicidios, desaparecidas o choques en el
>   mismo mapa de calor: la proporción 9 a 1 lo dominaría.
> - Campos sensibles (`autoidentificacion_etnica`, `nacionalidad`,
>   `estatus_migratorio`) fuera del mapa; solo en estadística agregada
>   (punto 9).

> [!success] 2026-09-22 — Conteo frente a tasa
> - **Mapa de puntos y mapas de calor → conteo absoluto.** Muestran dónde
>   ocurren los hechos.
> - **Estadísticas y comparaciones entre cantones o provincias → tasa por
>   100.000 habitantes.** Evita que los cantones más poblados aparezcan
>   siempre como los peores solo por tamaño.
>
> Resuelve el punto 5 y la pregunta abierta del punto 11. Requisitos:
>
> - Incorporar **población por cantón del INEC** como dataset adicional.
> - Mostrar siempre el **conteo junto a la tasa**, porque en cantones muy
>   pequeños la tasa es inestable (con 5.000 habitantes, un solo caso da una
>   tasa de 20).

> [!success] 2026-09-22 — Confianza y tiempo separados
> ⚪ Histórico **deja de ser un nivel de confianza**. Cada registro tiene dos
> atributos independientes:
>
> ```
> nivel_confianza  → oficial | verificado | reportado | en_revision
> vigencia         → historico | reciente
> ```
>
> El color siempre indica cómo se confirmó el dato, sin importar el año
> consultado. La vigencia se muestra aparte (por ejemplo, «🟢 Oficial · 2015»).
> Resuelve el punto 3. Con esto quedan cerradas las **tres decisiones que
> bloqueaban el esquema** (1, 3 y 5).

> [!success] 2026-09-22 — Incidentes en tiempo real
> 1. **Duración en «Actualidad»: entre 1 y 2 horas** (inicialmente 30
>    minutos, revisado el mismo día). Se implementa como **parámetro
>    configurable**, con valor inicial de **1 h 30 min**, para ajustarlo sin
>    tocar código. Pasado ese tiempo el incidente sale de la vista en tiempo real pero **sigue existiendo** como
>    registro, con su color de confianza. *(Supuesto derivado del punto
>    siguiente: si luego se fusiona con el dato oficial, no puede borrarse.)*
> 2. **Duplicados: se juntan.** Cuando el dato oficial llega (~1 mes
>    después), se fusiona con el reporte previo. Resuelve el punto 10.
> 3. **Registro obligatorio para reportar.** Cualquiera puede ver el mapa;
>    para registrar un incidente hay que crear una cuenta y verificarla. El
>    usuario elige el tipo de incidente de una lista (robo, muerte, tiroteo,
>    siniestro, etc.). Resuelve el punto 4 y reduce el riesgo de abuso.
> 4. **Notificaciones solo en móvil.** En PC el mapa es solo de consulta.
>    Revisado el mismo día: la notificación por cercanía («pasó algo cerca de
>    tu ubicación») **se posterga a una futura app nativa**. En la PWA solo se
>    notifican los **incidentes reportados por los usuarios** (reportes
>    ciudadanos, 🟠), mediante **suscripción por zona** (punto 12). Las
>    noticias no generan notificación.
>
> Pendiente de diseñar a partir de estas decisiones:
>
> - **Regla de fusión:** qué cuenta como «el mismo incidente» (mismo tipo,
>   distancia máxima, ventana de tiempo) y qué se conserva al fusionar. La
>   propuesta es que el registro fusionado suba a 🟢 Oficial y guarde el
>   rastro de todas sus fuentes.
> - **Método de verificación de cuenta** (correo, SMS, cédula…).
> - **Privacidad del informante:** aunque ahora esté registrado, el público
>   no debe ver quién reportó, y la ubicación publicada conviene difuminarla
>   a nivel de manzana. Los datos de cuenta pasan a ser datos personales bajo
>   la LOPDP.
> - **La lista de tipos** debe mapearse a la taxonomía común (punto 8).
> - **Notificaciones en PWA:** suscripción por zona aprobada; ver punto 12.

> [!success] 2026-09-22 — Historia, zonas, nota metodológica y desaparecidas
> - ~~Historia desde 2014~~ (punto 7). **Reemplazado el 2026-09-23: el mapa
>   empieza en 2019**, primer año en que todos los datasets tienen datos.
> - **Mapa de calor para los incidentes** (punto 11), además de los puntos al
>   acercar el mapa.
> - **Nota metodológica en el mapa** que explica que muestra denuncias, no
>   todo el delito que ocurre (punto 6).
> - **Desaparecidas localizadas: se quitan del mapa** (punto 10). Siguen
>   contando en estadísticas.
> - **Robos: por definir.** No hay fuente oficial; no aparecen en la v1.
> - **Coordenadas de choques y solicitudes a entidades públicas: pospuestas.**
>   Se retomarán después de conversarlo o evaluar un scraper.
>
> Versiones del sistema en [[Hoja de Ruta]].

> [!success] 2026-09-23 — Revisión de la propuesta de arquitectura
> Ver [[Arquitectura de la Plataforma]]. Se mantiene el orden de versiones,
> los cuatro niveles de confianza, el color por confianza (el tipo va con
> ícono) y los reportes ciudadanos en v2. Se adopta el **monolito modular**
> con la ingesta dentro de `backend/`. El campo de la IA se llama
> `extraction_confidence`. Redshift no guarda los datos del sistema: se
> prueba junto a Fabric Warehouse como experimento ([[Almacén Analítico]]).
> **Año de inicio: 2019**, el primer año en que todos los datasets tienen
> datos. Reemplaza la decisión anterior de empezar en 2014.

> [!success] 2026-09-23 — Versiones, cuentas y fuentes
> - **Documento por versión:** [[V1 - Mapa Histórico]], [[V2 - Tiempo Real]]
>   y [[V3 - Fuentes Colaboradoras e IA]], cada uno con una lista de pruebas
>   para hacer a mano.
> - **V1 incluye** página de inicio, página de metodología (con la explicación
>   de conteo frente a tasa) y página de licencia y fuentes.
> - **Solo Telegram** para fuentes colaboradoras. WhatsApp y WhatsApp Business
>   quedan descartados.
> - **Lista de tipos de incidente adoptada:** [[Tipos de Incidente]] (punto 8).
> - **Cuentas (V2):** verificación por correo; sin verificar no se puede
>   reportar ni suscribirse.
> - **Reportes falsos:** 1.ª falta → aviso; **2.ª falta → suspensión mínima de
>   30 días**, con aviso. Reemplaza el umbral configurable anterior.
> - **Límites de provincias, cantones y parroquias:** sin fuente todavía;
>   queda abierto.

### Consecuencias verificadas de esta decisión

| Hecho | ¿Punto en el mapa? | Motivo |
|---|---|---|
| Homicidios | ✅ Sí | Coordenadas 100 % |
| Desaparecidas | ✅ Sí | Coordenadas 100 % |
| Choques / siniestros | ⚠️ Solo por cantón | INEC no publica coordenadas |
| Robos | ❌ Sin fuente oficial | No existe dataset abierto |
| Tiempo real (cualquier tipo) | ✅ Sí | Scraper / reportes, confianza máx. 🟡 |

Implicación: el mapa necesita **dos formas de representación** conviviendo:
puntos donde el dato lo permite y áreas (cantón) donde no. Ver
[[Fuentes]].

## 11. Método para las zonas de mayor ocurrencia

> [!check] Resuelto el 2026-09-22 — mapa de calor para incidentes y detenidos (capas separadas), conteo absoluto.

Nueva decisión derivada del alcance. Tres opciones con compromisos reales:

| Método | Qué muestra | Pros | Contras |
|---|---|---|---|
| **Mapa de calor (KDE)** | Mancha continua de densidad | Intuitivo, trivial en MapLibre | Sin significado estadístico; cambia con el zoom |
| **Hexágonos H3** | Celdas hexagonales con conteo | Comparable, cacheable, agregable en PostGIS | Requiere elegir resolución |
| **Getis-Ord Gi\*** | Zonas estadísticamente significativas | Distingue foco real de azar | Complejo; difícil de explicar al usuario |

> [!note] Historia de esta decisión
> Se propuso primero usar **hexágonos H3**. Se descartó el 2026-09-22 al
> elegir **mapa de calor**, que MapLibre dibuja de forma nativa. La pregunta
> de si medir en conteo o en tasa también se resolvió: **el mapa usa conteo
> absoluto** y las estadísticas usan tasa (punto 5).

Para los choques, que solo existen por cantón, la «zona caliente» será
necesariamente el cantón completo.

## 1. Detenidos no son incidentes de inseguridad

> [!check] Resuelto el 2026-09-22 — capa de mapa de calor propia + estadística. Ver «Decisiones tomadas».

**Error de categoría.**

| Dataset | Naturaleza del hecho |
|---|---|
| Homicidios | Víctima |
| Desaparecidas | Víctima |
| Detenidos y aprehendidos | **Acción policial** |

No son la misma clase de suceso. Un sector con muchas detenciones puede indicar
más delito, o más presencia policial, que es lo contrario. Con el mismo
lenguaje visual, el usuario lee «peligroso» donde el dato dice «vigilado».

Agravante cuantitativo: **50.553 detenidos frente a 5.676 homicidios** en
enero–agosto 2026, proporción de 9 a 1. La capa más ruidosa sepultaría
visualmente a la más significativa.

**Decisión:** capas separadas con activación explícita del usuario, o excluir
el dataset del mapa y reservarlo para estadística.

## 2. El compromiso entre confianza y frescura está invertido

> [!check] Resuelto el 2026-09-22 — se mantiene el tiempo real asumiendo su techo 🟡 / 🟠. Ver «Decisiones tomadas».

| Capa | Confianza máxima alcanzable | Rezago |
|---|---|---|
| Datos oficiales | 🟢 Oficial | ~1 mes |
| Scraper de noticias policiales | 🟡 Reportado | minutos |

La vista que el usuario realmente va a consultar — «qué está pasando ahora» —
es estructuralmente **la menos fiable del sistema**. Y la más fiable llega con
un mes de retraso, inútil para decidir si salir esta noche.

El propio ejemplo de la nota original lo evidencia:
`🟡 Accidente · Portoviejo · Hace 25 min`. Ese amarillo es el **techo
matemático** de la capa en tiempo real; nunca podrá mostrarse un 🟢 ahí.

**Decisión:** asumir y comunicar con honestidad que «Actualidad» es información
sin confirmar, o retirar la promesa de tiempo real del producto.

## 3. La escala de confianza mezcla dos ejes distintos

> [!check] Resuelto el 2026-09-22 — `nivel_confianza` y `vigencia` separados. Ver «Decisiones tomadas».

🟢 🔵 🟡 🟠 miden **verificación**. ⚪ Histórico mide **tiempo**. Son
dimensiones independientes.

La nota original lo expone sin querer: *«⚪ Histórico es para cuando el usuario
ponga un año anterior al actual»*. Es decir, un homicidio de 2015 del
Ministerio del Interior **cambiaría de etiqueta según el filtro que aplique el
usuario**. Mismo dato, misma fuente, distinto nivel de confianza.

La fiabilidad de un dato no puede depender de lo que el usuario esté mirando.

**Decisión:** separar en dos atributos independientes.

```
nivel_confianza  → oficial | verificado | reportado | en_revision
vigencia         → historico | reciente
```

Un registro puede ser 🟢 Oficial **e** histórico simultáneamente.

### Sub-decisión: el orden de la escala

🔵 Verificado figura por debajo de 🟢 Oficial. Pero «confirmado por múltiples
fuentes independientes» es epistemológicamente más sólido que una única fuente
institucional, especialmente en cifras de seguridad donde el subregistro
oficial está documentado. La jerarquía actual codifica una postura; que sea
deliberada. Ver [[Niveles de Confianza]].

## 4. «Anónimo» y «GPS preciso» se contradicen

> [!check] Resuelto el 2026-09-22 — registro y cuenta verificada obligatorios para reportar. Ver «Decisiones tomadas».

Un reporte con coordenadas exactas, con hora, emitido desde el lugar del hecho
**no es anónimo**: es la ubicación del informante en ese instante.

- Quien reporta un robo desde su casa, publica su casa.
- Quien presencia un ajuste de cuentas y lo reporta en el sitio queda expuesto
  ante quien lo cometió.

Además el anonimato rompe el sistema de confianza por dos vías:

- **Imposibilita verificar.** Sin canal para repreguntar, ningún reporte
  asciende de 🟠 a 🔵 jamás.
- **Imposibilita detectar abuso.** Sin identidad persistente no hay reputación,
  y sin reputación no hay defensa frente a envenenamiento coordinado.

**Decisión propuesta:** seudónimo persistente por dispositivo — anónimo de cara
al público, trazable para moderación — y difuminado de la ubicación a nivel de
manzana en lugar de punto exacto. Relacionado con [[Riesgos Abiertos]].

## 5. Sin normalizar por población, la estadística miente

> [!check] Resuelto el 2026-09-22 — conteo en el mapa, tasa en estadísticas. Ver «Decisiones tomadas».

Un mapa de puntos crudos concluye siempre lo mismo: «Guayaquil y Quito son lo
peor». Evidente, porque ahí vive la gente.

Sin **tasa por 100.000 habitantes**, la sección de estadísticas produce
conclusiones falsas con apariencia de rigor. Es el error clásico de los mapas
de criminalidad y el argumento más habitual para desacreditarlos.

**Decisión:** incorporar población por cantón (INEC) como dataset adicional
desde el inicio. Afecta al esquema.

## 6. El mapa mide propensión a denunciar, no criminalidad

> [!check] Resuelto el 2026-09-22 — nota metodológica visible en el mapa.

Sesgo de denuncia. Con reportes ciudadanos se amplifica: las zonas con usuarios
activos y conectados aparecen peores que aquellas donde nadie reporta, lo que
puede invertir por completo la lectura respecto a la realidad.

No se elimina; **se declara**. Una nota metodológica visible forma parte del
producto, no de la letra pequeña.

## 7. Se desaprovechan ocho años de datos disponibles

> [!check] Resuelto el 2026-09-23 — historia desde 2019, primer año común a todos los datasets.

La nota propone «últimos 4 años» y filtros de «2025 2026». Dos incoherencias:

- Cuatro años serían 2023–2026, no dos años de filtros
- Las fuentes cubren desde **2014** (homicidios), **2017** (desaparecidas) y
  **2019** (detenidos)

Además, cada dataset arranca en un año distinto: el filtro temporal debe
conocer esa asimetría o mostrará caídas falsas donde solo hay ausencia de
fuente. Ver [[Fuentes]].

## 8. No existe la taxonomía común que exige el filtro «por tipo»

> [!check] Resuelto el 2026-09-23 — lista adoptada en [[Tipos de Incidente]].

> [!note] Propuesta original — adoptada el 2026-09-23
> La versión vigente y explicada está en [[Tipos de Incidente]]. Basada en los datos oficiales, las categorías del sitio de la Policía y los
> ejemplos dados (robo, muerte, tiroteo, siniestro).
>
> | Tipo | Viene de |
> |---|---|
> | Homicidio / asesinato | Min. Interior (`tipo_muerte`), Policía, reportes |
> | Sicariato | Min. Interior, Policía |
> | Femicidio | Min. Interior |
> | Tiroteo / disparos | Reportes ciudadanos |
> | Robo / asalto | Policía, reportes (sin dato oficial) |
> | Secuestro | Policía, reportes |
> | Extorsión | Policía, reportes |
> | Violencia sexual | Solo fuentes oficiales (decidido el 2026-09-24) |
> | Siniestro de tránsito | INEC (por cantón), reportes |
> | Persona desaparecida | Min. Interior, reportes |
> | Pelea / riña | Reportes ciudadanos |
> | Otro | Reportes ciudadanos |

| Dataset | Campo de tipificación |
|---|---|
| Homicidios | `tipo_muerte` |
| Detenidos | `codigo_iccs` |
| Desaparecidas | — (ninguno) |

El filtro por categoría no tiene sobre qué operar.

**Decisión propuesta:** adoptar **ICCS** (Clasificación Internacional del
Delito con fines estadísticos, de Naciones Unidas) como columna vertebral. Es
un estándar real y ya viene incluido en uno de los datasets. Mapear el resto
contra ella. Ver [[Esquema de Campos]].

## 9. Datos sensibles geolocalizados

> [!check] Resuelto el 2026-09-22 junto con el punto 1 — estos campos solo en estadística agregada, nunca en el mapa.

El dataset de detenidos incluye `autoidentificacion_etnica`, `nacionalidad` y
`estatus_migratorio`. Representar esos campos sobre un mapa equivale,
funcionalmente, a cartografía étnica.

Ecuador cuenta además con Ley Orgánica de Protección de Datos Personales desde
2021, y estas son categorías especialmente protegidas.

**Decisión:** no exponer estos campos a nivel de punto. Servirlos agregados o
no servirlos.

## 10. Dos huecos sin regla definida

> [!check] Resuelto el 2026-09-22 — duplicados se fusionan; desaparecidas localizadas se quitan del mapa.

**Duplicados entre fuentes.** Un homicidio figurará en el dataset oficial y,
potencialmente, en un reporte ciudadano. ¿Se fusionan? ¿Conviven? ¿Cuál
prevalece? Sin regla.

**Retirada de registros.** Una persona desaparecida que es localizada — ¿se
retira el marcador? ¿cuándo? El dataset aporta la fecha y el lugar de
localización, de modo que la información para decidirlo existe.

## 12. Notificaciones en móvil sin app nativa

> [!check] Aprobado el 2026-09-22 — suscripción por zona, solo para incidentes reportados por usuarios. La notificación por cercanía se posterga a la app nativa.

> [!check] Decidido el 2026-09-22 — **notificación inmediata**
> El aviso se envía en cuanto el usuario registra el reporte, marcado como
> «sin verificar». Se elige velocidad sobre verificación, asumiendo el riesgo
> de que un reporte falso llegue a todos los suscriptores de la zona.
>
> **Salvaguardas aprobadas (2026-09-22):**
>
> 1. **Etiqueta obligatoria.** Toda notificación de reporte ciudadano incluye
>    «🟠 Sin verificar».
> 2. **Límite de frecuencia.** Número máximo de reportes por cuenta y por hora.
>    Valor configurable, pendiente de fijar.
> 3. **Suspensión por reincidencia.** 1.ª falta: aviso. 2.ª falta:
>    suspensión mínima de 30 días, con aviso (decidido el 2026-09-23).
> 4. **Retirada de reportes falsos.** Un reporte declarado falso se cierra:
>    desaparece del mapa, de la vista «Actualidad» y del historial de
>    notificaciones dentro de la app. No se envía aviso de corrección.
>
> > [!warning] Límite técnico de la retirada
> > Una notificación que **ya llegó a la bandeja del teléfono** no puede
> > borrarse de forma fiable. Web Push obliga a mostrar un aviso visible por
> > cada mensaje recibido: iOS revoca el permiso tras varios envíos sin aviso,
> > y Chrome en Android muestra uno genérico. Comportamiento aprobado: si el
> > usuario toca una notificación de un reporte retirado, la app muestra que
> > ese reporte fue retirado.
>
> **Quién declara falso un reporte (aprobado 2026-09-22): votos de usuarios
> y un moderador.** Funcionamiento propuesto:
>
> 1. Los usuarios verificados votan un reporte como falso.
> 2. Al alcanzar un número de votos (configurable), el reporte pasa a
>    **revisión del moderador**.
> 3. Solo el **moderador** lo declara falso. En ese momento se cierra y
>    desaparece (salvaguarda 4) y cuenta para la suspensión del autor
>    (salvaguarda 3).
>
> Los votos solos no retiran ni suspenden: así un grupo de usuarios no puede
> tumbar un reporte verdadero ni hacer suspender a alguien votando en
> conjunto.

> [!note] Opciones que se evaluaron
> Un reporte ciudadano está en 🟠 En revisión. Enviarlo al instante a todos los
> suscriptores de la zona amplifica cualquier reporte falso. Opciones:
>
> | Opción | Velocidad | Riesgo |
> |---|---|---|
> | Al instante, marcado «sin verificar» | Inmediata | Alto: un reporte falso llega a todos |
> | Tras aprobación de un moderador | Depende del moderador | Bajo, pero necesita moderación activa en todo momento |
> | Tras **corroboración**: 2 o más usuarios verificados reportan lo mismo en la misma zona y ventana de tiempo | Rápida si hay testigos | Bajo; un usuario solo no dispara avisos |

Decidido que las notificaciones son solo para móvil. Pero la restricción de la
PWA aplica justamente en móvil: el navegador **no puede vigilar la ubicación
del usuario con la app cerrada**, así que «avisar si pasa algo cerca de donde
estoy ahora» no es posible sin app nativa.

**Propuesta: suscripción por zona.** El usuario elige una o varias zonas que
le interesan (su barrio, su cantón, el trayecto al trabajo). Cuando entra un
incidente en esa zona, **el servidor** envía la notificación por Web Push. No
hace falta conocer la ubicación del teléfono en segundo plano, así que
funciona en PWA.

Límites: en iOS, Web Push solo funciona desde la versión 16.4 y con la PWA
instalada en la pantalla de inicio. En Android funciona con normalidad.

Filtrar por gravedad y tipo es obligatorio: notificar cada incidente de
Guayaquil a todos sus suscriptores generaría decenas de avisos al día.

